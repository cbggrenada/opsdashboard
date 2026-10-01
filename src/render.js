
/* ================= charts ================= */
let charts=[];
const vlPlugin={id:'vl',afterDatasetsDraw(ch,args,o){
  if(!o||!o.on)return;const g=ch.ctx;g.save();
  const horiz=ch.options.indexAxis==='y';
  g.font='600 11px -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif';g.fillStyle=o.color||'#1d1d1f';
  ch.data.datasets.forEach((ds,i)=>{
    const meta=ch.getDatasetMeta(i);if(meta.hidden||ds.vl===false)return;
    if(ds.type==='line'&&!ds.vl)return;if(meta.type==='line'&&!ds.vl)return;
    const f=ds.axisFmt||o.fmt||(v=>v);
    meta.data.forEach((el,j)=>{const v=ds.data[j];if(v==null||!isFinite(v))return;
      const t=f(v);if(horiz){g.textAlign='left';g.textBaseline='middle';g.fillText(t,el.x+4,el.y)}
      else{g.textAlign='center';g.textBaseline='bottom';g.fillText(t,el.x,(v<0?el.y+14:el.y-3))}});
  });g.restore()}};
const donutPct={id:'dpct',afterDatasetsDraw(ch,a,o){
  if(ch.config.type!=='doughnut')return;const g=ch.ctx,ds=ch.data.datasets[0],meta=ch.getDatasetMeta(0);const tot=ds.data.reduce((x,y)=>x+(+y||0),0);if(!tot)return;
  g.save();g.font='600 11px -apple-system,BlinkMacSystemFont,Arial,sans-serif';g.fillStyle='#fff';g.textAlign='center';g.textBaseline='middle';
  meta.data.forEach((el,i)=>{const v=ds.data[i];if(!v||v/tot<.05||meta.data[i].hidden)return;const p=el.tooltipPosition();g.fillText(Math.round(v/tot*100)+'%',p.x,p.y)});g.restore()}};
function chartCfg(v,rep){
  const ink=rep?'#1d1d1f':css('--ink'),muted=rep?'#5B6878':css('--muted'),line=rep?'#E1E7EF':css('--line');
  const fmt=v.fmt||F.n0,fmt2=v.fmt2||fmt;
  const kind=v.kind||'bar';
  if(kind==='donut'){
    const tot=v.sets[0].data.reduce((a,b)=>a+(+b||0),0);
    return {type:'doughnut',data:{labels:v.labels,datasets:[{data:v.sets[0].data,backgroundColor:v.labels.map((_,i)=>(v.colors||PAL)[i%PAL.length]),borderColor:rep?'#fff':css('--surface'),borderWidth:2}]},
      options:{maintainAspectRatio:false,cutout:'58%',plugins:{dpct:{},legend:{position:v.legendPos||'right',labels:{color:ink,boxWidth:10,boxHeight:10,font:{size:12},
        generateLabels(ch){const d=ch.data.datasets[0];return ch.data.labels.map((l,i)=>({text:`${l}  ${fmt(d.data[i])} (${tot?Math.round(d.data[i]/tot*100):0}%)`,fillStyle:d.backgroundColor[i],strokeStyle:d.backgroundColor[i],hidden:!ch.getDataVisibility(i),index:i,fontColor:ink}))}},
        onClick(e,item,lg){lg.chart.toggleDataVisibility(item.index);lg.chart.update()}},
        tooltip:{callbacks:{label:c=>` ${c.label}: ${fmt(c.parsed)} (${tot?(c.parsed/tot*100).toFixed(1):0}%)`}}}},plugins:[donutPct]};
  }
  const horiz=kind==='hbar'||kind==='stack100h'||kind==='stackh';
  const stacked=kind==='stack'||kind==='stack100h'||kind==='stackh';
  const sets=v.sets.map((s,i)=>{
    const c=s.color||(v.colors||PAL)[i%PAL.length];
    const isLine=s.type==='line'||kind==='line';
    const o={label:s.label,data:s.data,type:isLine?'line':'bar',yAxisID:s.axis==='y2'?'y2':(horiz?'x':'y'),
      backgroundColor:isLine?c:(s.colors||c),borderColor:s.colors&&!s.color?'#01427A':c,borderWidth:isLine?2.5:0,borderRadius:isLine?0:4,maxBarThickness:46,
      pointRadius:isLine?(s.points?4:s.dash&&s.dash.length?0:s.data.length>40?0:3):0,pointHoverRadius:5,tension:.3,cubicInterpolationMode:'monotone',showLine:!s.points,borderDash:s.dash||[],fill:!!s.fill,order:isLine?0:1,spanGaps:true,
      vl:s.vl,axisFmt:s.axis==='y2'?fmt2:fmt};
    if(horiz&&!isLine){o.xAxisID='x';delete o.yAxisID}
    if(s.stack)o.stack=s.stack;
    return o;
  });
  for(const r of (v.refs||[])){sets.push({label:r.label,data:v.labels.map(()=>r.v),type:'line',borderColor:r.color||'#8A96A5',backgroundColor:r.color||'#8A96A5',borderDash:[6,4],borderWidth:1.6,pointRadius:0,yAxisID:r.axis==='y2'?'y2':'y',order:-1,vl:false,axisFmt:fmt})}
  const usesY2=sets.some(s=>s.yAxisID==='y2');
  const grid={color:line,drawTicks:false},ticks={color:muted,font:{size:11}};
  const valAxis={beginAtZero:v.zero!==false,stacked,grid,ticks:{...ticks,callback:x=>kind==='stack100h'?x+'%':(v.tickFmt||fmt)(x)},border:{display:false}};
  if(v.yMin!=null)valAxis.min=v.yMin;if(v.yMax!=null)valAxis.max=v.yMax;
  const catAxis={stacked,grid:{display:false},ticks:{...ticks,autoSkip:true,maxRotation:v.rotate===false?0:45},border:{color:line}};
  const scales=horiz?{x:{...valAxis,position:'bottom'},y:{...catAxis,ticks:{...catAxis.ticks,autoSkip:false}}}:{x:catAxis,y:valAxis};
  if(kind==='stack100h')scales.x.max=100;
  if(usesY2)scales.y2={position:'right',beginAtZero:v.zero2!==false,grid:{display:false},ticks:{...ticks,callback:x=>fmt2(x)},border:{display:false},...(v.y2Min!=null?{min:v.y2Min}:{}),...(v.y2Max!=null?{max:v.y2Max}:{})};
  const nBars=v.labels.length*v.sets.filter(s=>s.type!=='line'&&kind!=='line').length;
  const vlOn=v.vl!==undefined?v.vl:(!stacked&&kind!=='line'&&nBars>0&&nBars<=(horiz?24:14));
  return {type:'bar',data:{labels:v.labels,datasets:sets},
    options:{maintainAspectRatio:false,indexAxis:horiz?'y':'x',interaction:{mode:'index',intersect:false},layout:{padding:{top:vlOn&&!horiz?16:4,right:vlOn&&horiz?54:6}},
      scales,plugins:{vl:{on:vlOn,fmt,color:ink},
        legend:{display:v.legend!==undefined?v.legend:(sets.length>1),position:'bottom',labels:{color:ink,boxWidth:10,boxHeight:10,font:{size:12},usePointStyle:false,
          generateLabels(ch){return Chart.defaults.plugins.legend.labels.generateLabels(ch).map(l=>{const ds=ch.data.datasets[l.datasetIndex];if(Array.isArray(ds.backgroundColor)){l.fillStyle=ds.borderColor;l.strokeStyle=ds.borderColor}if(ds.type==='line'){l.fillStyle=ds.borderColor}return l})}}},
        tooltip:{callbacks:{label:c=>{const ds=c.dataset;const val=horiz?c.parsed.x:c.parsed.y;if(val==null)return null;return ` ${ds.label||''}: ${kind==='stack100h'?val.toFixed(1)+'%':(ds.yAxisID==='y2'?fmt2:fmt)(val)}`}}}}},
    plugins:[vlPlugin]};
}
function drawChart(canvas,v){const c=new Chart(canvas,chartCfg(v,false));charts.push(c);return c}
function chartImg(v,w=900,h=320){
  const host=document.createElement('div');host.style.cssText=`position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`;
  const c=document.createElement('canvas');c.width=w;c.height=h;host.appendChild(c);document.body.appendChild(host);let url='';
  try{const cfg=chartCfg(v,true);cfg.options.responsive=false;cfg.options.animation=false;cfg.options.devicePixelRatio=2;
    cfg.plugins=[...(cfg.plugins||[]),{id:'bg',beforeDraw(x){const g=x.ctx;g.save();g.fillStyle='#fff';g.fillRect(0,0,x.width,x.height);g.restore()}}];
    const ch=new Chart(c,cfg);url=c.toDataURL('image/png');ch.destroy()}catch(e){url=''}
  host.remove();return url;
}

/* ================= tables ================= */
function heat(v,min,max,lowGood){if(v==null||max===min)return '';const t=(v-min)/(max-min),x=lowGood?t:1-t;const c=x<.5?`rgba(30,132,73,${.28*(1-x*2)+.05})`:`rgba(192,57,43,${.28*(x-.5)*2+.05})`;return `background:${c}`}
function tableHTML(v,rep){
  if(!v.rows||!v.rows.length)return `<div class="nodata">${esc(v.empty||'No data for this selection.')}</div>`;
  const cols=v.cols;let min=Infinity,max=-Infinity;
  if(v.heat)v.rows.forEach(r=>cols.forEach(c=>{if(c.heat){const x=r[c.k];if(isNum(x)){min=Math.min(min,x);max=Math.max(max,x)}}}));
  const cell=(c,r,isTot)=>{if(r._grp)return '';const raw=c.f?c.f(r):r[c.k];const txt=c.fmt?c.fmt(raw,r):(raw==null?'–':raw);const cls=[c.l?'l':'',c.wrap?'wrap':'',c.cls?c.cls(raw,r):''].join(' ').trim();
    const st=v.heat&&c.heat&&!isTot?heat(raw,min,max,v.lowGood):'';return `<td class="${cls}"${st?` style="${st}"`:''}>${c.html?txt:esc(txt)}</td>`};
  const head=`<tr>${cols.map(c=>`<th class="${c.l?'l':''}">${esc(c.h)}</th>`).join('')}</tr>`;
  const body=v.rows.map(r=>r._grp?`<tr class="grp"><td class="l" colspan="${cols.length}">${esc(r._grp)}</td></tr>`:`<tr>${cols.map(c=>cell(c,r)).join('')}</tr>`).join('');
  const foot=v.total?`<tfoot><tr>${cols.map(c=>cell(c,v.total,true)).join('')}</tr></tfoot>`:'';
  return rep?`<table>${'<thead>'+head+'</thead>'}<tbody>${body}</tbody>${foot}</table>`:`<div class="btbl" style="${v.maxH?'max-height:'+v.maxH+'px':''}"><table><thead>${head}</thead><tbody>${body}</tbody>${foot}</table></div>`;
}

/* ================= render ================= */
function pageList(secId){return PAGES.filter(p=>p.sec===secId)}
function setPage(id){const p=PAGES.find(x=>x.id===id)||PAGES[0];CUR=p;if(location.hash.slice(1)!==p.id)history.replaceState(null,'','#'+p.id);OPEN=null;render();window.scrollTo({top:0})}
let OPEN=null; // open picker id
function renderNav(){
  document.getElementById('secs').innerHTML=SECTIONS.map(s=>`<button data-sec="${s.id}" aria-pressed="${CUR.sec===s.id}">${esc(s.name)}</button>`).join('');
  document.getElementById('tabs').innerHTML=pageList(CUR.sec).map(p=>`<button role="tab" data-page="${p.id}" ${p===CUR?'aria-current="page"':''}>${esc(p.tab||p.title)}</button>`).join('');
  const a=document.querySelector('#tabs [aria-current]');if(a)a.scrollIntoView({block:'nearest',inline:'nearest'});
}
function renderBar(){
  const p=CUR,bar=document.getElementById('bar');
  bar.innerHTML=(p.slicers||[]).map(s=>{
    const v=selOf(p,s),o=s.options();
    if(s.kind==='seg')return `<div class="seg" role="group" aria-label="${esc(s.label)}">${o.map(x=>`<button data-seg="${s.id}" data-v="${esc(x.v)}" aria-pressed="${v.includes(x.v)}">${esc(x.l)}</button>`).join('')}</div>`;
    const open=OPEN===s.id;
    let list='';
    if(open){
      let lastG=null;
      list=o.map((x,i)=>{const g=s.grouped&&x.g!==lastG?`<div class="msg">${esc(x.g)}</div>`:'';lastG=x.g;
        return `${g}<label class="mso"><input type="${s.kind==='single'?'radio':'checkbox'}" name="r-${s.id}" data-sl="${s.id}" data-i="${i}" ${v.includes(x.v)?'checked':''}>${esc(x.l)}</label>`}).join('')||'<div class="msg">No values</div>';
      list=`<div class="msp" role="dialog" aria-label="${esc(s.label)}"><div class="msa">${s.kind==='single'?'':`<button data-all="${s.id}">All</button>`}${s.latest?`<button data-latest="${s.id}">Latest month</button>`:''}${s.kind==='single'?'':`<button data-close="1">Done</button>`}</div><div class="msl">${list}</div></div>`;
    }
    return `<div class="ms"><button class="msb ${v.length&&s.kind!=='single'?'on':''}" data-ms="${s.id}" aria-expanded="${open}" aria-haspopup="true"><span class="msk">${esc(s.label)}</span><span>${esc(slicerSummary(p,s))}</span></button>${list}</div>`;
  }).join('')+(p.barNote?`<span class="note">${esc(p.barNote)}</span>`:'');
}
function sourcesFor(p){
  const out=[];if(!DATA)return out;
  for(const t of (p.tables||[])){
    const files=(DATA.sources||[]).filter(s=>s.tables.some(x=>x.name===t&&x.used));
    if(!files.length)out.push({file:t,none:true});
    for(const f of files)if(!out.some(o=>o.file===f.file))out.push({file:f.file,time:f.time});
  }
  // one badge for the monthly Utilities Tracking workbooks
  const ut=out.filter(o=>/utilities_tracking/i.test(o.file));
  if(ut.length>1){const keep=out.filter(o=>!ut.includes(o));keep.push({file:`Utilities Tracking (${ut.length} months)`,time:Math.max(...ut.map(o=>o.time))});return keep}
  return out;
}
function renderHero(){
  const p=CUR,secName=SECTIONS.find(s=>s.id===p.sec).name;
  document.getElementById('eyebrow').textContent='Carib Brewery Grenada | '+secName;
  const sel=(p.slicers||[]).filter(s=>s.kind!=='seg'&&selOf(p,s).length).map(s=>`${s.label}: ${slicerSummary(p,s)}`);
  document.getElementById('ptxt').innerHTML=`${esc(p.title)}${p.sub?` <span class="psub">${esc(p.sub)}</span>`:''}`;
  document.getElementById('pmeta').innerHTML=[esc(secName),...(sel.length?sel.map(esc):['All data'])].join('<span class="dot"></span>');
  const gen=DATA&&DATA.generatedAt?new Date(DATA.generatedAt):null;
  document.getElementById('upd').innerHTML=DATA?[gen?`Dashboard rebuilt ${gen.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}`:'',
    OFFLINE?'Showing the copy saved in this file':''].filter(Boolean).join('<span class="dot"></span>'):'';
  const src=sourcesFor(p);
  document.getElementById('fresh').innerHTML=src.map(s=>s.none?`<span class="fb none" title="Not found in data/raw"><i></i>${esc(s.file)} <em>missing</em></span>`:
    `<span class="fb" title="Uploaded ${esc(new Date(s.time).toLocaleString('en-GB'))}"><i></i>${esc(s.file.replace(/\.(xlsx|xlsm|xls|csv)$/i,''))} <em>${esc(new Date(s.time).toLocaleDateString('en-GB',{day:'numeric',month:'short'}))}</em></span>`).join('');
}
function visualHTML(v,i){
  const span='s'+(v.span||(v.t==='card'?3:6));
  if(v.t==='sec')return `<div class="sec">${esc(v.title)}</div>`;
  if(v.t==='row')return `<div class="s12 trow">${v.items.map(x=>visualHTML({...x,span:'x'})).join('')}</div>`;
  if(v.t==='card'){
    const na=v.v==null||(typeof v.v==='number'&&!isFinite(v.v));
    const val=na?`<div class="tv na">${esc(v.na||'No data')}</div>`:typeof v.v==='string'?`<div class="tv txt">${esc(v.v)}</div>`:(t=>`<div class="tv${t.length>=11?' xs':t.length>=8?' s':''}">${esc(t)}${v.unit?`<small>${esc(v.unit)}</small>`:''}</div>`)((v.fmt||F.n0)(v.v));
    return `<div class="tile ${v.st||''} ${span}"><div class="tl">${esc(v.label)}</div>${v.foot?`<div class="tf">${esc(v.foot)}</div>`:''}${val}${v.sub?`<div class="ts ${v.subSt||''}">${esc(v.sub)}</div>`:''}</div>`;
  }
  const head=`<h2>${esc(v.title)}</h2>${v.hint?`<p class="hint">${esc(v.hint)}</p>`:'<p class="hint"></p>'}`;
  const notes=v.notes&&v.notes.length?`<p class="notes">${v.notes.map(esc).join('<br>')}</p>`:'';
  if(v.t==='chart'){
    const empty=!v.labels||!v.labels.length||!v.sets.some(s=>s.data.some(x=>x!=null&&x!==0));
    const tall=(v.kind==='hbar'||v.kind==='stackh')&&v.labels&&v.labels.length>12?` style="height:${Math.max(300,v.labels.length*(v.sets.filter(s=>s.type!=='line').length>1?30:20)+70)}px"`:'';
    return `<div class="panel ${span}">${head}<div class="cv ${v.size||''}"${tall}>${empty?`<div class="nodata">${esc(v.empty||'No data for this selection.')}</div>`:`<canvas data-v="${i}" role="img" aria-label="${esc(v.title)}"></canvas>`}</div>${notes}</div>`;
  }
  if(v.t==='table')return `<div class="panel ${span}">${head}${tableHTML(v)}${notes}</div>`;
  if(v.t==='text')return `<div class="panel ${span}">${head}${v.lines&&v.lines.length?`<ul class="ins">${v.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:`<div class="nodata">${esc(v.empty||'No data for this selection.')}</div>`}${notes}</div>`;
  return '';
}
function buildPage(p){try{return p.build(makeCtx(p))}catch(e){console.error(e);return [text('Something went wrong on this page',[String(e&&e.message||e)],{span:12})]}}
function render(){
  if(!READY)return;
  charts.forEach(c=>c.destroy());charts=[];
  renderNav();renderBar();renderHero();
  const main=document.getElementById('main');
  if(!DATA){main.innerHTML=`<div class="empty"><h2>Data could not be loaded</h2><p>${esc(LOAD_ERR||'')}</p><p>Upload the workbooks to <b>data/raw</b> in the GitHub repository. The site rebuilds itself in about two minutes.</p></div>`;return}
  const vs=buildPage(CUR);
  main.innerHTML=`<div class="grid">${vs.map(visualHTML).join('')}</div>`;
  main.querySelectorAll('canvas[data-v]').forEach(c=>drawChart(c,vs[+c.dataset.v]));
}
