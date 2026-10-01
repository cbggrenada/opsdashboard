
/* ================= report generator ================= */
const RPT_KEY='cbg_ops_report_prefs_v1';
const RPT_CSS=`
.rpt{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;letter-spacing:-.01em;color:#1d1d1f;background:#fff;max-width:960px;margin:0 auto;padding:28px 34px 34px;font-size:13.5px;line-height:1.45}
.rpt *{box-sizing:border-box}
.rpt .rh{display:flex;align-items:center;gap:16px;border-bottom:3px solid #01427A;padding-bottom:12px;margin-bottom:12px}
.rpt .rh img{height:54px}
.rpt .rh h1{font-family:"Barlow Condensed","Arial Narrow",sans-serif;text-transform:uppercase;font-size:28px;font-weight:700;letter-spacing:.04em;color:#01427A;margin:0;line-height:1.05}
.rpt .rh .p{font-size:14px;font-weight:600;margin-top:3px}
.rpt .meta{display:flex;flex-wrap:wrap;gap:4px 22px;font-size:12px;color:#5B6878;margin:0 0 10px}
.rpt h2{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:21px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#01427A;margin:26px 0 2px;break-after:avoid}
.rpt .sel{font-size:12px;color:#5B6878;margin:0 0 8px}
.rpt h3{font-size:14px;margin:14px 0 6px;break-after:avoid}
.rpt ul{margin:4px 0 0;padding-left:18px}.rpt li{margin:3px 0}
.rpt table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin:2px 0 6px}
.rpt th{background:#01427A;color:#fff;font-weight:600;text-align:right;padding:5px 7px;white-space:nowrap}
.rpt td{padding:4px 7px;text-align:right;border-bottom:1px solid #E6EBF1}
.rpt th.l,.rpt td.l{text-align:left}.rpt td.wrap{white-space:normal}
.rpt tbody tr:nth-child(even) td{background:#F6F8FB}
.rpt tr.grp td{background:#fff!important;font-weight:700;color:#01427A;text-transform:uppercase;letter-spacing:.06em;padding-top:10px}
.rpt tfoot td{font-weight:700;border-top:1px solid #1d1d1f;background:#fff}
.rpt .g{color:#1E8449;font-weight:600}.rpt .b{color:#C0392B;font-weight:600}.rpt .m{color:#5B6878}
.rpt .pill{font-weight:600}.rpt .pill.g{color:#1E8449}.rpt .pill.b{color:#C0392B}
.rpt .kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px;margin:6px 0 4px}
.rpt .k{border:1px solid #E1E7EF;border-top:3px solid #01427A;border-radius:8px;padding:8px 10px;break-inside:avoid}
.rpt .k.good{border-top-color:#1E8449}.rpt .k.bad{border-top-color:#C0392B}.rpt .k.warn{border-top-color:#E0A21B}
.rpt .k .kl{font-size:12px;font-weight:600}.rpt .k .kv{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:24px;font-weight:700;line-height:1.1;margin:2px 0}
.rpt .k .kv small{font-family:inherit;font-size:13px;color:#5B6878}.rpt .k .ks{font-size:11px;color:#5B6878}
.rpt .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rpt .ch{break-inside:avoid;margin:4px 0}.rpt .ch.full{grid-column:1/-1}.rpt .ch img{width:100%;height:auto;border:1px solid #E6EBF1;border-radius:6px}
.rpt .ch .ct{font-weight:600;font-size:12.5px;margin:0 0 3px}
.rpt .note{font-size:11px;color:#5B6878;margin:2px 0 6px}
.rpt .notes{white-space:pre-wrap;background:#F6F8FB;border-left:4px solid #E0A21B;padding:8px 12px;margin:8px 0}
.rpt .pb{break-before:page}
.rpt .foot{margin-top:18px;border-top:1px solid #D9E1EA;padding-top:6px;font-size:11px;color:#5B6878}
@media (max-width:640px){.rpt{padding:18px 14px}.rpt .cgrid{grid-template-columns:1fr}.rpt .rh img{height:40px}.rpt .rh h1{font-size:21px}}
@media print{.rpt{max-width:none;padding:0}.rpt table,.rpt .ch,.rpt .k{break-inside:avoid}}
`;
(function(){const st=document.createElement('style');st.textContent=RPT_CSS;document.head.appendChild(st)})();
function rptPrefs(){try{return JSON.parse(localStorage.getItem(RPT_KEY)||'{}')}catch(e){return {}}}
function rptSave(p){try{localStorage.setItem(RPT_KEY,JSON.stringify(p))}catch(e){}}
function selText(p){const s=(p.slicers||[]).map(x=>`${x.label}: ${x.kind==='seg'?selOf(p,x)[0]:slicerSummary(p,x)}`);return s.join(' · ')||'All data'}
function cardText(v){if(v.v==null)return 'No data';return typeof v.v==='string'?v.v:(v.fmt||F.n0)(v.v)+(v.unit?' '+v.unit:'')}
function rptBuild(o){
  const logo=document.querySelector('.logo').src;
  const now=new Date();const parts=[],txt=[`${o.title}`,`Prepared ${now.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'})}`,''];
  o.pages.forEach((id,pi)=>{
    const p=PAGES.find(x=>x.id===id);if(!p)return;const vs=buildPage(p);
    const sel=selText(p);
    let h=`<h2${pi&&o.breaks?' class="pb"':''}>${esc(p.title)}</h2><div class="sel">${esc(SECTIONS.find(s=>s.id===p.sec).name)} · ${esc(sel)}</div>`;
    txt.push(p.title.toUpperCase(),sel);
    const cards=[];vs.forEach(v=>{if(v.t==='card')cards.push(v);if(v.t==='row')cards.push(...v.items)});
    if(cards.length){h+=`<div class="kpis">${cards.map(v=>`<div class="k ${v.st||''}"><div class="kl">${esc(v.label)}</div><div class="kv">${v.v==null?'<small>No data</small>':esc(typeof v.v==='string'?v.v:(v.fmt||F.n0)(v.v))}${v.unit&&v.v!=null&&typeof v.v!=='string'?`<small> ${esc(v.unit)}</small>`:''}</div>${v.sub||v.foot?`<div class="ks">${esc(v.sub||v.foot)}</div>`:''}</div>`).join('')}</div>`;
      cards.forEach(v=>txt.push(`- ${v.label}: ${cardText(v)}${v.sub?' ('+v.sub+')':''}`))}
    if(o.insights)vs.filter(v=>v.t==='text'&&v.lines&&v.lines.length).forEach(v=>{h+=`<h3>${esc(v.title)}</h3><ul>${v.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`;v.lines.forEach(l=>txt.push('- '+l))});
    if(o.charts){const ch=vs.filter(v=>v.t==='chart'&&v.labels&&v.labels.length&&v.sets.some(s=>s.data.some(x=>x)));
      if(ch.length)h+=`<div class="cgrid">${ch.map(v=>{const full=(v.span||6)>=12||v.kind==='stack'||v.labels.length>16;const img=chartImg(v,full?1100:640,full?340:330);
        return `<div class="ch ${full?'full':''}"><div class="ct">${esc(v.title)}</div>${img?`<img alt="${esc(v.title)}" src="${img}">`:''}${v.hint?`<div class="note">${esc(v.hint)}</div>`:''}</div>`}).join('')}</div>`}
    if(o.tables)vs.filter(v=>v.t==='table'&&v.rows&&v.rows.length).forEach(v=>{const lim=o.rowLimit||40;const vv=v.rows.length>lim?{...v,rows:v.rows.slice(0,lim)}:v;
      h+=`<h3>${esc(v.title)}</h3>${tableHTML(vv,true)}${v.rows.length>lim?`<div class="note">First ${lim} of ${fmtN(v.rows.length)} rows.</div>`:''}`});
    const nts=uniq(vs.flatMap(v=>v.notes||[]));if(nts.length)h+=`<div class="note">${nts.map(esc).join('<br>')}</div>`;
    parts.push(h);txt.push('');
  });
  if(o.notes)txt.push('NOTES',o.notes);
  const html=`<div class="rpt"><div class="rh"><img src="${logo}" alt="Carib Brewery"><div><h1>${esc(o.title)}</h1><div class="p">${esc(o.sub||'')}</div></div></div>
    <div class="meta"><span>Prepared ${esc(now.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}))}</span>${DATA&&DATA.generatedAt?`<span>Data rebuilt ${esc(new Date(DATA.generatedAt).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}))}</span>`:''}<span>${o.pages.length} page${o.pages.length===1?'':'s'}</span></div>
    ${o.notes?`<div class="notes">${esc(o.notes)}</div>`:''}${parts.join('')}
    <div class="foot">Carib Brewery Grenada · Operations dashboard · figures from the workbooks uploaded to the dashboard, filtered as shown under each heading.</div></div>`;
  return {title:o.title,html,text:txt.join('\n')};
}
function showReportDialog(){
  const pr=rptPrefs();const dlg=document.getElementById('dlg');
  const chosen=new Set([CUR.id]);
  dlg.innerHTML=`<form class="dlg" method="dialog"><div class="dlg-h"><h2>Generate report</h2><p>Pick the pages to include. Each page uses the filters currently set on it.</p></div>
    <div class="dlg-b">
      <div class="rrow"><label>Report title<input id="rTitle" value="${esc(pr.title||'CBG Operations Report')}"></label><label>Subtitle<input id="rSub" value="${esc(pr.sub||'Brewing, supply chain and KPI performance')}"></label></div>
      ${SECTIONS.map(s=>`<fieldset class="rsec"><legend><label class="rck"><input type="checkbox" data-secall="${s.id}"> ${esc(s.name)}</label></legend><div class="rgrid">${pageList(s.id).map(p=>`<label class="rck"><input type="checkbox" data-rp="${p.id}" ${chosen.has(p.id)?'checked':''}> ${esc(p.tab||p.title)}</label>`).join('')}</div></fieldset>`).join('')}
      <div class="rsub">Include</div>
      <div class="rgrid"><label class="rck"><input type="checkbox" id="rCharts" ${pr.charts!==false?'checked':''}> Charts</label><label class="rck"><input type="checkbox" id="rTables" ${pr.tables!==false?'checked':''}> Tables</label>
        <label class="rck"><input type="checkbox" id="rIns" ${pr.insights!==false?'checked':''}> Key insights</label><label class="rck"><input type="checkbox" id="rBreaks" ${pr.breaks?'checked':''}> Each page on a new sheet</label></div>
      <div class="rrow" style="margin-top:10px"><label>Notes for the reader (optional)<textarea id="rNotes" placeholder="Context, actions, follow-ups…"></textarea></label></div>
    </div>
    <div class="dlg-f"><span class="msg2" id="rMsg"></span><button class="btn" value="cancel">Cancel</button><button class="btn primary" id="rGo" value="go">Build report</button></div></form>`;
  const q=s=>dlg.querySelector(s);
  dlg.querySelectorAll('[data-secall]').forEach(cb=>cb.onchange=()=>dlg.querySelectorAll(`[data-rp]`).forEach(x=>{if(PAGES.find(p=>p.id===x.dataset.rp).sec===cb.dataset.secall)x.checked=cb.checked}));
  q('#rGo').onclick=e=>{e.preventDefault();
    const pages=[...dlg.querySelectorAll('[data-rp]:checked')].map(x=>x.dataset.rp);
    if(!pages.length){q('#rMsg').textContent='Pick at least one page.';return}
    const o={title:q('#rTitle').value.trim()||'CBG Operations Report',sub:q('#rSub').value.trim(),pages,charts:q('#rCharts').checked,tables:q('#rTables').checked,insights:q('#rIns').checked,breaks:q('#rBreaks').checked,notes:q('#rNotes').value.trim()};
    rptSave({title:o.title,sub:o.sub,charts:o.charts,tables:o.tables,insights:o.insights,breaks:o.breaks});
    q('#rGo').textContent='Building…';setTimeout(()=>{const R=rptBuild(o);dlg.close();showReport(R)},30)};
  dlg.showModal();
}
function showReport(R){
  let v=document.getElementById('rptView');
  if(!v){v=document.createElement('div');v.id='rptView';document.body.appendChild(v)}
  v.innerHTML=`<div class="rv-bar"><button class="btn" data-r="back">‹ Back to dashboard</button><span class="rv-t">${esc(R.title)}</span>
    <button class="btn" data-r="copy">Copy summary</button><button class="btn" data-r="email">Email summary</button><button class="btn" data-r="html">Download</button><button class="btn primary" data-r="print">Print / Save as PDF</button></div>
    <div class="rv-page">${R.html}</div>`;
  v.hidden=false;document.body.classList.add('rpt-open');v.scrollTop=0;
  const q=s=>v.querySelector(s);
  q('[data-r="back"]').onclick=()=>{v.hidden=true;document.body.classList.remove('rpt-open')};
  q('[data-r="print"]').onclick=()=>{const t=document.title;document.title=R.title;window.print();setTimeout(()=>document.title=t,500)};
  q('[data-r="copy"]').onclick=async()=>{try{await navigator.clipboard.writeText(R.text);toast('Summary copied. Paste it into an email or message.')}catch(e){toast('Copy was blocked by the browser. Use Download instead.')}};
  q('[data-r="email"]').onclick=()=>{const body=R.text.length>1800?R.text.slice(0,1800)+'…':R.text;location.href=`mailto:?subject=${encodeURIComponent(R.title)}&body=${encodeURIComponent(body)}`};
  q('[data-r="html"]').onclick=()=>{
    const doc=`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(R.title)}</title><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&display=swap" rel="stylesheet"><style>body{margin:0;background:#fff}${RPT_CSS}</style></head><body>${R.html}</body></html>`;
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([doc],{type:'text/html'}));a.download=R.title.replace(/[^\w\- ]+/g,'').replace(/\s+/g,'_')+'.html';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);
    toast('Report downloaded. Open it in any browser, or print it to PDF.')};
}

/* ================= events ================= */
let tt;function toast(m){const el=document.getElementById('toast');el.textContent=m;el.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>el.classList.remove('on'),4500)}
document.getElementById('rptBtn').onclick=()=>{if(DATA)showReportDialog();else toast('No data loaded yet.')};
document.addEventListener('click',e=>{
  const sb=e.target.closest('[data-sec]');if(sb){const p=pageList(sb.dataset.sec)[0];if(p)setPage(p.id);return}
  const pb=e.target.closest('[data-page]');if(pb){setPage(pb.dataset.page);return}
  const sg=e.target.closest('[data-seg]');if(sg){SEL[CUR.id]=SEL[CUR.id]||{};SEL[CUR.id][sg.dataset.seg]=[(CUR.slicers.find(s=>s.id===sg.dataset.seg).options().find(o=>String(o.v)===sg.dataset.v)||{}).v];render();return}
  const ms=e.target.closest('[data-ms]');if(ms){OPEN=OPEN===ms.dataset.ms?null:ms.dataset.ms;renderBar();return}
  const all=e.target.closest('[data-all]');if(all){SEL[CUR.id][all.dataset.all]=[];render();return}
  const lat=e.target.closest('[data-latest]');if(lat){const s=CUR.slicers.find(x=>x.id===lat.dataset.latest);const o=s.options();SEL[CUR.id][s.id]=o.length?[o[o.length-1].v]:[];OPEN=null;render();return}
  if(e.target.closest('[data-close]')){OPEN=null;renderBar();return}
  if(OPEN&&!e.target.closest('.ms')){OPEN=null;renderBar()}
});
document.addEventListener('change',e=>{
  const t=e.target;if(!t.dataset||!t.dataset.sl)return;
  const s=CUR.slicers.find(x=>x.id===t.dataset.sl);const o=s.options()[+t.dataset.i];if(!o)return;
  SEL[CUR.id]=SEL[CUR.id]||{};let cur=selOf(CUR,s);
  if(s.kind==='single'){cur=[o.v];OPEN=null}else cur=t.checked?uniq([...cur,o.v]):cur.filter(x=>x!==o.v);
  SEL[CUR.id][s.id]=cur;render();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&OPEN){OPEN=null;renderBar()}});
window.addEventListener('hashchange',()=>{const id=location.hash.slice(1);if(id&&(!CUR||id!==CUR.id)&&PAGES.some(p=>p.id===id))setPage(id)});
let rT;window.addEventListener('resize',()=>{clearTimeout(rT);rT=setTimeout(()=>charts.forEach(c=>c.resize()),150)});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>render());

/* ================= start ================= */
(async()=>{
  await loadData();
  const id=location.hash.slice(1);CUR=PAGES.find(p=>p.id===id)||pageList(SECTIONS[0].id)[0];
  if(window.Chart){Chart.defaults.font.family='-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif'}
  render();
})();
</script>
</body>
</html>
