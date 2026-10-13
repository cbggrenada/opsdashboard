
/* ================= Compare: months or years side by side, in a pop-out window =================
   Built on the KPI scorecard (Scorecard_Monthly): one row per KPI per month with Actual, Budget, Prior Year and YTD.
   The Prior Year column also gives last year's months, so a month can be compared with the same month a year earlier
   even before last year's files are uploaded. */
const CMP={by:'month',sel:[],same:true,kpi:null,chart:null,last:null};
const CPX_PDF_LIBS=['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js','https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'];
function cpxData(){
  // real rows, plus last year's months from the Prior Year column where there is no real row for them
  const R=(T.Scorecard_Monthly||[]).filter(r=>r.KPI&&r._y&&r._m);
  const key=r=>`${r._y}-${pad(r._m)}|${r.KPI}`,have=new Set(R.map(key)),out=R.map(r=>({...r,_py:false}));
  for(const r of R)if(isNum(r['Prior Year'])){const v={...r,_y:r._y-1,Actual:r['Prior Year'],Budget:null,YTD:null,'Prior Year':null,_py:true};if(!have.has(key(v))){have.add(key(v));out.push(v)}}
  return out;
}
function cpxKpis(D){const m=new Map();for(const r of D)if(!m.has(r.KPI))m.set(r.KPI,{k:r.KPI,d:r.Department||'',s:r['KPI Sort']||0});
  const dOrder=uniq((T.Scorecard_Monthly||[]).map(r=>r.Department||''));
  return [...m.values()].sort((a,b)=>(dOrder.indexOf(a.d)-dOrder.indexOf(b.d))||(a.s-b.s))}
const cpxIsPct=k=>/%/.test(k);
const cpxFmt=(k,v)=>v==null?'–':kpiFmt(k)(v)+(cpxIsPct(k)?'%':'');
function cpxOptions(by,D){
  const ms=uniq(D.map(r=>`${r._y}-${pad(r._m)}`)).sort();
  if(by==='year')return uniq(D.map(r=>String(r._y))).sort().map(y=>({v:y,l:y+(D.some(r=>String(r._y)===y&&!r._py)?'':' (prior-year figures)')}));
  return ms.map(k=>({v:k,l:ymLabel(k)+(D.some(r=>`${r._y}-${pad(r._m)}`===k&&!r._py)?'':' *'),g:k.slice(0,4)}));
}
function cpxDefaults(by,D){const o=cpxOptions(by,D).map(x=>x.v);return o.slice(-2)}
// one period: its value for each KPI, and its budget
function cpxPeriod(by,v,D,cut){
  if(by==='month'){const rs=D.filter(r=>`${r._y}-${pad(r._m)}`===v);
    return {v,label:ymLabel(v),sub:rs.length&&rs.every(r=>r._py)?'from prior-year column':'month',val:k=>{const r=rs.find(x=>x.KPI===k);return r&&isNum(r.Actual)?r.Actual:null},bud:k=>{const r=rs.find(x=>x.KPI===k);return r&&isNum(r.Budget)?r.Budget:null},n:rs.length}}
  const y=+v,rs=D.filter(r=>r._y===y&&(!cut||r._m<=cut)),lastM=Math.max(0,...rs.map(r=>r._m));
  const sub=lastM?`Jan–${MONTHS[lastM-1]}${rs.every(r=>r._py)?' · prior-year column':''}`:'';
  return {v,label:String(y),sub,n:rs.length,
    val:k=>{const ks=rs.filter(r=>r.KPI===k);if(!ks.length)return null;const L=ks.find(r=>r._m===lastM);
      if(L&&isNum(L.YTD))return L.YTD;          // the report's own year-to-date figure
      return kpiAgg(ks,k,'Actual')},           // otherwise: cases added up, other KPIs averaged
    bud:k=>kpiAgg(rs.filter(r=>r.KPI===k),k,'Budget')};
}
function cpxPresets(D){
  const ms=cpxOptions('month',D).map(o=>o.v),real=uniq((T.Scorecard_Monthly||[]).map(ymKey).filter(Boolean)).sort(),out=[];
  const L=real[real.length-1];if(!L)return out;const i=ms.indexOf(L),ly=`${+L.slice(0,4)-1}-${L.slice(5)}`;
  if(i>0)out.push({l:'This month vs last month',by:'month',sel:[ms[i-1],L]});
  if(ms.includes(ly))out.push({l:'This month vs same month last year',by:'month',sel:[ly,L]});
  const ys=cpxOptions('year',D).map(o=>o.v),y=L.slice(0,4);if(ys.includes(String(+y-1)))out.push({l:'This year vs last year',by:'year',sel:[String(+y-1),y]});
  return out;
}
function openCompare(start){
  const D=cpxData();if(!D.length){toast('No KPI scorecard data has been uploaded yet.');return}
  const d=document.getElementById('cmpDlg');
  if(start){CMP.by=start.by;CMP.sel=[...start.sel]}
  else{// start from what the page shows: the months picked on the scorecard, or the latest two months
    const p=CUR,s=p&&(p.slicers||[]).find(x=>x.id==='month'),v=s?[...selOf(p,s)].sort():[];
    if(s&&isYtd(p,s)){const y=v[0].slice(0,4);CMP.by='year';CMP.sel=cpxOptions('year',D).map(o=>o.v).filter(x=>x<=y).slice(-2)}
    else if(v.length>1){CMP.by='month';CMP.sel=v.slice(-6)}
    else{CMP.by='month';const ms=cpxOptions('month',D).map(o=>o.v),L=v[0]&&ms.includes(v[0])?v[0]:ms[ms.length-1],i=ms.indexOf(L);CMP.sel=i>0?[ms[i-1],L]:[L]}}
  CMP.same=true;renderCompare();if(!d.open)d.showModal();
}
function renderCompare(){
  const d=document.getElementById('cmpDlg'),D=cpxData(),by=CMP.by,opts=cpxOptions(by,D),MAX=6;
  CMP.sel=uniq(CMP.sel.filter(v=>opts.some(o=>o.v===v))).sort();if(!CMP.sel.length)CMP.sel=cpxDefaults(by,D);
  // years still running are compared like for like: every year up to the same month as the latest one
  const real=D.filter(r=>!r._py),lastReal=real.length?real.reduce((a,r)=>`${r._y}-${pad(r._m)}`>a?`${r._y}-${pad(r._m)}`:a,''):'';
  const running=by==='year'&&CMP.sel.length>1&&CMP.sel.includes(lastReal.slice(0,4))&&+lastReal.slice(5)<12;
  // like for like: up to the latest month that every selected year has
  const cut=running&&CMP.same?Math.min(+lastReal.slice(5),...CMP.sel.map(y=>Math.max(0,...D.filter(r=>String(r._y)===y).map(r=>r._m)))):null;
  const P=CMP.sel.map(v=>cpxPeriod(by,v,D,cut)),first=P[0],lastP=P[P.length-1];
  const K=cpxKpis(D).filter(x=>P.some(p=>p.val(x.k)!=null));if(!K.some(x=>x.k===CMP.kpi))CMP.kpi=K.length?K[0].k:null;
  const unit=by==='year'?'year':'month';
  const optHtml=sel=>{let h='',g=null;for(const o of opts){if(o.g!==g){if(g!=null)h+='</optgroup>';if(o.g)h+=`<optgroup label="${esc(o.g)}">`;g=o.g}h+=`<option value="${o.v}" ${o.v===sel?'selected':''}>${esc(o.l)}</option>`}return h+(g?'</optgroup>':'')};
  const seg=['year','month'].map(b=>`<button type="button" data-cby="${b}" aria-pressed="${by===b}">${b==='year'?'Years':'Months'}</button>`).join('');
  const pills=CMP.sel.map((v,i)=>`<span class="sh-pill"><select data-ci="${i}" aria-label="${unit} ${i+1}">${optHtml(v)}</select>${CMP.sel.length>1?`<button type="button" data-crm="${i}" aria-label="Remove">×</button>`:''}</span>`).join('');
  const canAdd=CMP.sel.length<MAX&&opts.length>CMP.sel.length;
  const sw=running?`<label class="sh-sw"><input type="checkbox" role="switch" id="cSame" ${CMP.same?'checked':''}><i aria-hidden="true"></i>Same part of each year${cut?` (Jan–${MONTHS[cut-1]})`:''}</label>`:'';
  const presets=cpxPresets(D),isOn=x=>x.by===by&&x.sel.length===CMP.sel.length&&x.sel.every((v,i)=>v===CMP.sel[i]);
  const chips=presets.map((x,i)=>`<button type="button" class="sh-chip" data-pre="${i}" aria-pressed="${isOn(x)}">${esc(x.l)}</button>`).join('');
  let nb=0,nw=0,lastD=null;
  const rows=K.map(({k,d:dep})=>{
    const up=!lowerBetter(k),vals=P.map(p=>p.val(k)),buds=P.map(p=>p.bud(k));
    const cells=P.map((p,i)=>{const st=status(vals[i],buds[i],up);return `<td class="${st||''}" title="${buds[i]!=null?`Budget ${cpxFmt(k,buds[i])}${st?' · '+ST_LABEL[st]:''}`:'No budget'}">${cpxFmt(k,vals[i])}</td>`}).join('');
    let chg='';if(P.length>1){const a=vals[0],b=vals[vals.length-1];
      if(a==null||b==null)chg='<td class="chg">–</td>';
      else{const dl=b-a,z=Math.abs(dl)<1e-9,good=up?dl>0:dl<0;if(!z){good?nb++:nw++}
        const txt=cpxIsPct(k)?`${fmtN(Math.abs(dl),1)} pts`:(a?`${fmtN(Math.abs(dl/a*100),1)}%`:'–');
        chg=`<td class="chg ${z?'':good?'good':'bad'}" title="${cpxFmt(k,a)} → ${cpxFmt(k,b)}">${z?'No change':`${dl>0?'▲':'▼'} ${txt} <span class="sh-bw">${good?'better':'worse'}</span>`}</td>`}}
    const grp=dep!==lastD?`<tr class="sh-days"><td colspan="${P.length+(P.length>1?2:1)}"><b>${esc(dep)}</b></td></tr>`:'';lastD=dep;
    return `${grp}<tr data-ck="${esc(k)}" class="${k===CMP.kpi?'sel':''}"><td>${esc(k)}</td>${cells}${chg}</tr>`}).join('');
  const head=`<tr><th>KPI</th>${P.map(p=>`<th>${esc(p.label)}<small>${esc(p.sub)}</small></th>`).join('')}${P.length>1?`<th>Change<small>${esc(first.label)} → ${esc(lastP.label)}</small></th>`:''}</tr>`;
  const sub=P.length>1?`<b>${esc(lastP.label)}</b> against <b>${esc(first.label)}</b>: <span class="g">better on ${nb} KPI${nb===1?'':'s'}</span> and <span class="b">worse on ${nw}</span>.`:`Add another ${unit} to compare with ${esc(first.label)}.`;
  const notes=[`Green meets the budget, amber is within ${NEAR_PCT}% of it, red is further off. Click a KPI to chart it.`];
  if(by==='year')notes.push('A year shows the report\'s own year-to-date figure where it has one; otherwise cases are added up and the other KPIs averaged.');
  if(cut)notes.push(`Years are compared like for like, January to ${MONTHS_L[cut-1]}.`);
  if(P.some(p=>/prior-year/.test(p.sub)))notes.push('Periods marked prior-year come from the Prior Year column of the following year\'s reports, which has no budget.');
  CMP.last={by,P,K,first,lastP,nb,nw};
  d.innerHTML=`<div class="sh">
  <div class="sh-h"><div><h2>Compare</h2><p>${sub}</p></div><button type="button" class="sh-x" id="cX" aria-label="Close">×</button></div>
  <div class="sh-b">
    <div class="sh-ctl"><span class="sh-seg" role="group" aria-label="Compare">${seg}</span>${chips?`<span class="sh-chips">${chips}</span>`:''}</div>
    <div class="sh-pills">${pills}${canAdd?`<button type="button" class="sh-add" id="cAdd">+ Add ${unit}</button>`:''}${sw}</div>
    <div class="sh-grid">
      <div class="sh-card sh-tw"><table class="cpxt"><thead>${head}</thead><tbody>${rows||`<tr><td>No KPI figures for these ${unit}s.</td></tr>`}</tbody></table></div>
      <div class="sh-card"><div class="sh-ct">${esc(CMP.kpi||'')}</div><div class="cv"><canvas id="cmpChart" role="img" aria-label="Chart of the selected KPI"></canvas></div></div>
    </div>
    <p class="sh-note">${notes.map(esc).join(' ')}</p>
  </div>
  <div class="sh-f"><span class="sh-fl"><button type="button" class="sh-btn" id="cEmail">Email</button><button type="button" class="sh-btn" id="cPrint">Print</button><button type="button" class="sh-btn" id="cPdf">Download PDF</button><button type="button" class="sh-btn" id="cCopy">Copy table</button></span><button type="button" class="sh-btn p" id="cClose">Done</button></div></div>`;
  const $=q=>d.querySelector(q);
  d.querySelectorAll('[data-cby]').forEach(b=>b.onclick=()=>{if(CMP.by!==b.dataset.cby){CMP.by=b.dataset.cby;CMP.sel=cpxDefaults(CMP.by,D)}renderCompare()});
  d.querySelectorAll('select[data-ci]').forEach(x=>x.onchange=()=>{CMP.sel[+x.dataset.ci]=x.value;renderCompare()});
  d.querySelectorAll('[data-crm]').forEach(b=>b.onclick=()=>{CMP.sel.splice(+b.dataset.crm,1);renderCompare()});
  d.querySelectorAll('[data-pre]').forEach(b=>b.onclick=()=>{const x=presets[+b.dataset.pre];CMP.by=x.by;CMP.sel=[...x.sel];renderCompare()});
  d.querySelectorAll('tr[data-ck]').forEach(tr=>tr.onclick=()=>{CMP.kpi=tr.dataset.ck;renderCompare()});
  if($('#cAdd'))$('#cAdd').onclick=()=>{const used=new Set(CMP.sel),o=opts.map(x=>x.v).filter(v=>!used.has(v)),earliest=CMP.sel[0];
    const before=o.filter(v=>v<earliest);CMP.sel.push(before.length?before[before.length-1]:o[o.length-1]);renderCompare()};
  if($('#cSame'))$('#cSame').onchange=e=>{CMP.same=e.target.checked;renderCompare()};
  $('#cEmail').onclick=cpxEmail;$('#cPrint').onclick=cpxPrint;$('#cPdf').onclick=cpxPdf;
  $('#cClose').onclick=$('#cX').onclick=()=>d.close();
  $('#cCopy').onclick=()=>{const tsv=[...d.querySelectorAll('.cpxt tr')].map(tr=>[...tr.children].map(td=>td.innerText.replace(/\n/g,' ').trim()).join('\t')).join('\n');
    (navigator.clipboard?navigator.clipboard.writeText(tsv):Promise.reject()).then(()=>toast('Comparison copied. Paste it into Excel or an email.'),()=>toast('Copy is not available in this browser.'))};
  if(CMP.chart){CMP.chart.destroy();CMP.chart=null}
  const cv=$('#cmpChart');if(cv&&window.Chart&&CMP.kpi){const k=CMP.kpi,up=!lowerBetter(k);
    const vals=P.map(p=>p.val(k)),tg=P.map(p=>p.bud(k)),cols=vals.map((v,i)=>{const st=status(v,tg[i],up);return st==='good'?css('--good'):st==='warn'?css('--amber'):st==='bad'?css('--bad'):css('--navy')});
    const sets=[{type:'bar',label:k,data:vals,backgroundColor:cols,borderRadius:8,maxBarThickness:64}];
    if(tg.some(x=>x!=null))sets.push({type:'line',label:'Budget',data:tg,borderColor:css('--muted'),borderDash:[6,4],pointRadius:3,pointBackgroundColor:css('--muted'),borderWidth:2,spanGaps:true});
    CMP.chart=new Chart(cv,{data:{labels:P.map(p=>p.label),datasets:sets},options:{responsive:true,maintainAspectRatio:false,animation:false,
      plugins:{legend:{display:sets.length>1,position:'top',align:'end'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${cpxFmt(k,c.parsed.y)}`}}},
      scales:{x:{grid:{display:false}},y:{beginAtZero:!cpxIsPct(k)||Math.min(...vals.filter(isNum))<50,grid:{color:'rgba(120,130,150,.18)'}}}}});}
}
/* ---- email, print and PDF of what the window shows ---- */
function cpxTitle(){const L=CMP.last;return L.P.length>1?`${L.lastP.label} compared with ${L.P.slice(0,-1).map(p=>p.label).join(', ')}`:L.first.label}
function cpxRows(plain){const L=CMP.last;
  return L.K.map(({k,d})=>{const up=!lowerBetter(k),vals=L.P.map(p=>p.val(k)),st=L.P.map((p,i)=>status(vals[i],p.bud(k),up));let chg='',cs='';
    if(L.P.length>1){const a=vals[0],b=vals[vals.length-1];
      if(a==null||b==null)chg='–';else{const dl=b-a,z=Math.abs(dl)<1e-9,good=up?dl>0:dl<0,amt=cpxIsPct(k)?`${fmtN(Math.abs(dl),1)} pts`:(a?`${fmtN(Math.abs(dl/a*100),1)}%`:'–');
        chg=z?'No change':`${plain?(dl>0?'+':'-'):(dl>0?'▲ ':'▼ ')}${amt} ${good?'better':'worse'}`;cs=z?'':good?'good':'bad'}}
    return {k,d,l:k,vals:vals.map(v=>cpxFmt(k,v)),st,chg,cs}})}
function cpxNotes(){const L=CMP.last;return [`Green = on budget, amber = within ${NEAR_PCT}% of budget, red = off budget.${L.P.length>1?` Change is from ${L.first.label} to ${L.lastP.label}.`:''}`]}
const cpxFile=ext=>`CBG operations comparison ${CMP.last.P.map(p=>p.label).join(' vs ')}.${ext}`.replace(/[\\/:*?"<>|]/g,'-');
function cpxEmail(){const L=CMP.last,rows=cpxRows(true),w=Math.max(...rows.map(r=>r.l.length),3);
  const lines=[L.P.length>1?`${L.lastP.label} against ${L.first.label}: better on ${L.nb}, worse on ${L.nw}.`:'','',`${'KPI'.padEnd(w)}  ${L.P.map(p=>p.label).join('  |  ')}${L.P.length>1?'  |  Change':''}`,
    ...rows.map(r=>`${r.l.padEnd(w)}  ${r.vals.join('  |  ')}${L.P.length>1?'  |  '+r.chg:''}`),'',...cpxNotes(),'','(For the full table and chart, use Download PDF in the dashboard and attach it.)'];
  let body=lines.join('\n');if(body.length>1800)body=body.slice(0,1800)+'…';
  location.href=`mailto:?subject=${encodeURIComponent('CBG operations comparison: '+cpxTitle())}&body=${encodeURIComponent(body)}`}
function cpxChartImg(w=1100,h=430){const L=CMP.last,k=CMP.kpi;if(!k||!window.Chart)return '';const c=document.createElement('canvas');c.width=w;c.height=h;const up=!lowerBetter(k);
  const vals=L.P.map(p=>p.val(k)),tg=L.P.map(p=>p.bud(k)),hex=s=>s==='good'?'#1E8449':s==='warn'?'#E0A21B':s==='bad'?'#C0392B':'#01427A';
  const sets=[{type:'bar',label:k,data:vals,backgroundColor:vals.map((v,i)=>hex(status(v,tg[i],up))),borderRadius:6,maxBarThickness:90}];
  if(tg.some(x=>x!=null))sets.push({type:'line',label:'Budget',data:tg,borderColor:'#8A96A5',borderDash:[6,4],pointRadius:3,borderWidth:2,spanGaps:true});
  let url='';try{const ch=new Chart(c,{data:{labels:L.P.map(p=>p.label),datasets:sets},plugins:[{id:'bg',beforeDraw:x=>{const g=x.ctx;g.save();g.fillStyle='#fff';g.fillRect(0,0,x.width,x.height);g.restore()}}],
    options:{responsive:false,animation:false,devicePixelRatio:2,plugins:{legend:{display:sets.length>1,position:'top',align:'end'},title:{display:true,text:k,color:'#0E1B2C',font:{size:16,weight:'600'},align:'start'}},
      scales:{x:{grid:{display:false}},y:{grid:{color:'#E3E8EF'}}}}});url=c.toDataURL('image/png');ch.destroy()}catch(e){}
  return url}
function cpxPrintHtml(){const L=CMP.last,rows=cpxRows(false),img=cpxChartImg(),logo=(document.querySelector('img.logo')||{}).src||'';
  const col=s=>s==='good'?'#1E8449':s==='bad'?'#C0392B':'#0E1B2C',bg=s=>s==='warn'?'background:#FBEFD2;':'';let lastD=null;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc('CBG operations comparison: '+cpxTitle())}</title><style>
  @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;font:11.5px/1.35 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0E1B2C;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #01427A;padding-bottom:8px;margin-bottom:10px}header img{height:40px}h1{margin:0;font-size:19px;color:#01427A}.m{color:#5B6878;font-size:11px}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:4px 8px;border-bottom:1px solid #D9E1EA;text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
  thead th{background:#01427A;color:#fff}thead th small{display:block;font-weight:400;opacity:.85}td.g{font-weight:700;color:#01427A;background:#EEF3F9}
  .chart{margin-top:10px;text-align:center;page-break-inside:avoid}.chart img{max-width:100%;max-height:60mm}.notes{color:#5B6878;font-size:10px;margin-top:8px}</style></head><body>
  <header>${logo?`<img src="${logo}" alt="Carib Brewery">`:''}<div><h1>Operations comparison: ${esc(cpxTitle())}</h1><div class="m">Carib Brewery Grenada · Operations dashboard · ${esc(new Date().toLocaleString('en-GB',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'}))}</div></div></header>
  <table><thead><tr><th>KPI</th>${L.P.map(p=>`<th>${esc(p.label)}<small>${esc(p.sub)}</small></th>`).join('')}${L.P.length>1?'<th>Change</th>':''}</tr></thead><tbody>
  ${rows.map(r=>{const g=r.d!==lastD?`<tr><td class="g" colspan="${L.P.length+(L.P.length>1?2:1)}">${esc(r.d)}</td></tr>`:'';lastD=r.d;return g+`<tr><td>${esc(r.l)}</td>${r.vals.map((v,i)=>`<td style="color:${col(r.st[i])};${bg(r.st[i])}">${esc(v)}</td>`).join('')}${L.P.length>1?`<td style="color:${col(r.cs)};font-weight:600">${esc(r.chg)}</td>`:''}</tr>`}).join('')}
  </tbody></table>${img?`<div class="chart"><img src="${img}" alt="Chart"></div>`:''}<div class="notes">${cpxNotes().map(esc).join(' ')}</div></body></html>`}
function cpxPrint(){let f=document.getElementById('cpxPrintFrame');if(f)f.remove();
  f=document.createElement('iframe');f.id='cpxPrintFrame';f.title='Print';f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);f.onload=()=>{setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch(e){toast('Printing was blocked by the browser.')}},250)};f.srcdoc=cpxPrintHtml()}
function cpxLoad(src){return new Promise((res,rej)=>{if(document.querySelector(`script[src="${src}"]`))return res();const x=document.createElement('script');x.src=src;x.onload=res;x.onerror=()=>rej(new Error(src));document.head.appendChild(x)})}
async function cpxPdf(){const btn=document.getElementById('cPdf');if(btn){btn.disabled=true;btn.textContent='Preparing…'}
  try{
    try{for(const u of CPX_PDF_LIBS)await cpxLoad(u)}catch(e){toast('The PDF maker could not load (is the internet connected?). Use Print and choose "Save as PDF" instead.');return}
    const L=CMP.last,rows=cpxRows(true),{jsPDF}=window.jspdf,doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'}),W=297,H=210,M=12;
    const img=document.querySelector('img.logo');let x0=M;
    if(img&&img.src){try{const r=(img.naturalWidth||300)/(img.naturalHeight||194),h=13;doc.addImage(img.src,'PNG',M,9,h*r,h);x0=M+h*r+5}catch(e){}}
    doc.setFont('helvetica','bold');doc.setFontSize(17);doc.setTextColor(1,66,122);doc.text(`Operations comparison: ${cpxTitle()}`,x0,15.5,{maxWidth:W-x0-M});
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(91,104,120);
    doc.text(`Carib Brewery Grenada · Operations dashboard · ${new Date().toLocaleString('en-GB',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'})}`,x0,21);
    doc.setDrawColor(1,66,122);doc.setLineWidth(.8);doc.line(M,25,W-M,25);let y=31;
    if(L.P.length>1){doc.setFontSize(11.5);doc.setTextColor(14,27,44);doc.setFont('helvetica','bold');doc.text(`${L.lastP.label} against ${L.first.label}: better on ${L.nb} KPI${L.nb===1?'':'s'}, worse on ${L.nw}.`,M,y);y+=4}
    const C={good:[30,132,73],bad:[192,57,43]},body=[],meta=[];let lastD=null;
    for(const r of rows){if(r.d!==lastD){body.push([{content:r.d,colSpan:L.P.length+(L.P.length>1?2:1),styles:{fontStyle:'bold',textColor:[1,66,122],fillColor:[238,243,249]}}]);meta.push(null);lastD=r.d}
      body.push([r.l,...r.vals,...(L.P.length>1?[r.chg]:[])]);meta.push(r)}
    doc.autoTable({startY:y,head:[['KPI',...L.P.map(p=>`${p.label}\n${p.sub}`),...(L.P.length>1?['Change']:[])]],body,margin:{left:M,right:M},theme:'plain',
      styles:{fontSize:8.5,cellPadding:1.6,halign:'right',lineColor:[217,225,234],lineWidth:{bottom:.2}},headStyles:{fillColor:[1,66,122],textColor:255,fontStyle:'bold'},columnStyles:{0:{halign:'left',cellWidth:56}},
      didParseCell:d=>{if(d.column.index===0)d.cell.styles.halign='left';if(d.section!=='body')return;const r=meta[d.row.index];if(!r)return;const i=d.column.index-1;
        if(i>=0&&i<L.P.length){const st=r.st[i];if(C[st])d.cell.styles.textColor=C[st];if(st==='warn')d.cell.styles.fillColor=[251,239,210]}
        if(i===L.P.length&&C[r.cs]){d.cell.styles.textColor=C[r.cs];d.cell.styles.fontStyle='bold'}}});
    y=doc.lastAutoTable.finalY+6;const chart=cpxChartImg(1100,430),cw=W-2*M;
    if(chart){if(H-y-18<50){doc.addPage();y=14}const hh=Math.min(cw*430/1100,H-y-18);doc.addImage(chart,'PNG',M+(cw-hh*1100/430)/2,y,hh*1100/430,hh);y+=hh+4}
    doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(91,104,120);doc.text(doc.splitTextToSize(cpxNotes().join(' '),W-2*M),M,Math.min(y+2,H-10));
    const n=doc.getNumberOfPages();for(let i=1;i<=n;i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(140);doc.text(`Page ${i} of ${n}`,W-M,H-6,{align:'right'})}
    doc.save(cpxFile('pdf'));toast('PDF downloaded.');
  }finally{if(btn){btn.disabled=false;btn.textContent='Download PDF'}}}
document.addEventListener('click',e=>{if(e.target.closest('#cmpBtn'))openCompare()});
document.addEventListener('click',e=>{const d=document.getElementById('cmpDlg');if(d&&e.target===d)d.close()});
