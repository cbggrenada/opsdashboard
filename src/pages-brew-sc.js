
/* ================= helpers for pages ================= */
const oneYear=ks=>uniq(ks.map(k=>String(k).slice(0,4))).length<=1;
function byMonth(rows,fn,keys){
  const g=group(rows,ymKey);const ks=keys||[...g.keys()].sort();
  return {keys:ks,labels:ks.map(k=>ymLabel(k,oneYear(ks))),data:ks.map(k=>g.has(k)?fn(g.get(k)):null)};
}
function byCat(rows,keyFn,fn,o={}){
  const g=group(rows,typeof keyFn==='string'?r=>r[keyFn]:keyFn);
  let arr=[...g.entries()].map(([k,rs])=>({k,v:fn(rs),rs}));
  if(o.sort!==false)arr.sort((a,b)=>o.asc?(a.v??Infinity)-(b.v??Infinity):(b.v??-Infinity)-(a.v??-Infinity));
  if(o.order)arr.sort((a,b)=>o.order.indexOf(a.k)-o.order.indexOf(b.k));
  if(o.top&&arr.length>o.top){const rest=arr.slice(o.top);arr=arr.slice(0,o.top);if(o.other)arr.push({k:'Other',v:o.other(rest.flatMap(x=>x.rs)),rs:rest.flatMap(x=>x.rs)})}
  return {labels:arr.map(x=>x.k),data:arr.map(x=>x.v),items:arr};
}
const monthNameKey=m=>MONTHS.findIndex(x=>x.toLowerCase()===String(m||'').slice(0,3).toLowerCase());
function topLines(items,fmt,n=3){return items.slice(0,n).map(x=>`${x.k} (${fmt(x.v)})`).join(', ')}
function chg(a,b){return a==null||b==null||!b?null:(a-b)/Math.abs(b)*100}
const sgn=v=>v==null?'':(v>0?'+':'')+fmtN(v,1);

/* =============================================================
   BREWING PERFORMANCE (CBG_Brewing_Process_2026.pbix)
   ============================================================= */
page({sec:'brew',id:'brewing',title:'Brewing Performance YTD',tab:'Brewing Performance YTD',tables:['FactYTDBrews'],
  slicers:[monthSlicer(['FactYTDBrews']),fieldSlicer('brand','Brand','FactYTDBrews','Brand'),fieldSlicer('brewer','Brewer','FactYTDBrews','Brewer')],
  build(c){
    const R=c.rows('FactYTDBrews');const E='No brews for this selection.';
    // brews per day: brews ÷ the days covered by each daily report sheet (as in the Power BI measure)
    const days=[...group(R,r=>r['Source Sheet']+'|'+r._m).values()].reduce((a,rs)=>a+(+rs[0]['Report Days']||0),0);
    const over=R.filter(r=>r['Brew Time Flag']==='Over Target').length;
    const timed=R.filter(r=>isNum(r['Brew Time Mins'])).length;
    const m=byMonth(R,rs=>rs.length);
    return [
      card('Total brews',R.length,{span:3,foot:'Brews recorded in the daily brewing reports'}),
      card('Brews per day',div(R.length,days),{fmt:F.n1,span:3,foot:'Brews ÷ days covered by the reports'}),
      card('Extract recovery',avg(R,'Extract Recovery'),{fmt:F.p2,span:3,foot:'Average per brew'}),
      card('Average boil off',avg(R,'Boil Off'),{fmt:F.p2,span:3,foot:'Average per brew'}),
      card('Average cool time',avg(R,'Cool Time'),{fmt:F.n1,unit:'min',span:3,foot:'Minutes, average per brew'}),
      card('Average brew time',avg(R,'Brew Time Mins'),{fmt:F.hhmm,unit:'h:mm',span:3,foot:`From ${fmtN(timed)} timed brews`}),
      card('Brews over target time',over,{span:3,foot:'Brew time flagged "Over Target"',sub:R.length?`${fmtN(over/R.length*100,1)}% of brews`:''}),
      card('Gravity evaporation',avg(R,'PG Drop'),{fmt:F.n2,span:3,foot:'Average P.G. drop, lab to cellar'}),
      chart('Brews by month',{kind:'bar',labels:m.labels,sets:[{label:'Brews',data:m.data}],empty:E}),
      chart('Average brew time by month',{kind:'bar',hint:'Minutes per brew',...(x=>({labels:x.labels,sets:[{label:'Minutes',data:x.data,color:PAL[1]}]}))(byMonth(R,rs=>avg(rs,'Brew Time Mins'))),fmt:F.n0,empty:E}),
      chart('Extract recovery by month',{kind:'line',hint:'Average % per brew',...(x=>({labels:x.labels,sets:[{label:'Extract recovery %',data:x.data,color:PAL[0],vl:true}]}))(byMonth(R,rs=>avg(rs,'Extract Recovery'))),fmt:F.p1,zero:false,empty:E}),
      chart('Boil off by month',{kind:'bar',hint:'Average %',...(x=>({labels:x.labels,sets:[{label:'Boil off %',data:x.data,color:PAL[3]}]}))(byMonth(R,rs=>avg(rs,'Boil Off'))),fmt:F.p1,empty:E}),
      chart('Extract recovery by brewer',{kind:'hbar',hint:'Average % per brew · axis starts at 95%',...(x=>({labels:x.labels,sets:[{label:'Extract recovery %',data:x.data}]}))(byCat(R,'Brewer',rs=>avg(rs,'Extract Recovery'))),fmt:F.p1,zero:false,yMin:95,empty:E}),
      chart('Brew time by brewer',{kind:'hbar',hint:'Average minutes per brew',...(x=>({labels:x.labels,sets:[{label:'Minutes',data:x.data,color:PAL[1]}]}))(byCat(R,'Brewer',rs=>avg(rs,'Brew Time Mins'),{asc:true})),fmt:F.n0,empty:E}),
      table('Brew log',{span:12,hint:`${fmtN(R.length)} brews · brewing time is hours:minutes`,maxH:460,empty:E,
        cols:[{h:'Brew no.',k:'Brew No',l:1},{h:'Month',k:'Month',l:1},{h:'Brand',k:'Brand',l:1},{h:'Brewer',k:'Brewer',l:1},
          {h:'Brewing time',k:'Brew Time Mins',fmt:F.hhmm},{h:'Flag',k:'Brew Time Flag',l:1,html:1,fmt:v=>v?`<span class="pill ${v==='Over Target'?'b':v==='Borderline'?'a':v==='On Target'||v==='Within Target'?'g':''}">${esc(v)}</span>`:'–'},
          {h:'Extract rec. %',k:'Extract Recovery',fmt:F.n2},{h:'Boil off %',k:'Boil Off',fmt:F.n2},{h:'Cool (min)',k:'Cool Time',fmt:F.n0},{h:'Remarks',k:'Remarks',l:1,wrap:1}],
        rows:[...R].sort((a,b)=>(a._m-b._m)||String(a['Brew No']).localeCompare(String(b['Brew No'])))}),
    ];
  }});

/* =============================================================
   SUPPLY CHAIN RUNDOWN (CBG_Supply_Chain_Rundown_2026.pbix)
   ============================================================= */
const BUCKETS=['Breakdowns','Changeover Variation','Quality','Logistics','Utilities','Other'];
page({sec:'sc',id:'downtime-glance',title:'Downtime at a glance',sub:'for plan attainment',tab:'Downtime at a glance',tables:['YTD_Summary','Daily_2Week','Equipment_Pareto'],
  slicers:[fieldSlicer('line','Line','YTD_Summary','Line'),monthSlicer(['YTD_Summary','Daily_2Week'])],
  build(c){
    const Y=c.rows('YTD_Summary'),D=c.rows('Daily_2Week'),EP=c.all('Equipment_Pareto');
    const b=k=>sum(Y.filter(r=>r.Bucket===k),'Hours');
    const tot=sum(D,'DowntimeHours');
    const cards=[card('Total downtime',tot,{fmt:F.n1,unit:'h',foot:'All stoppages, daily log'})];
    BUCKETS.forEach(k=>cards.push(card(k==='Changeover Variation'?'Changeover variation':k,b(k),{fmt:F.n1,unit:'h',foot:tot&&b(k)!=null?`${fmtN(b(k)/sum(Y,'Hours')*100,1)}% of categorised hours`:''})));
    const donut=byCat(Y,'Bucket',rs=>sum(rs,'Hours'));
    const lines=uniq(Y.map(r=>r.Line)).sort();
    const pv=group(Y,r=>ymKey(r)+'|'+r.Line);
    const prow=[...pv.entries()].sort().map(([k,rs])=>{const o={m:ymLabel(k.split('|')[0]),line:k.split('|')[1]};BUCKETS.forEach(b=>o[b]=sum(rs.filter(r=>r.Bucket===b),'Hours'));o.tot=sum(rs,'Hours');return o});
    const ptot={m:'Total',line:''};BUCKETS.forEach(b=>ptot[b]=sum(Y.filter(r=>r.Bucket===b),'Hours'));ptot.tot=sum(Y,'Hours');
    return [row(cards),
      chart('Downtime distribution by category',{kind:'donut',labels:donut.labels,sets:[{data:donut.data}],fmt:F.h1}),
      chart('Equipment downtime and cumulative %',{kind:'bar',hint:'Pareto of breakdown hours by equipment, year to date (not affected by the filters)',labels:EP.map(r=>r.Equipment),
        sets:[{label:'Hours',data:EP.map(r=>r.Hours)},{label:'Cumulative %',data:EP.map(r=>r['Cumulative %']),type:'line',axis:'y2',color:PAL[1]}],fmt:F.n1,fmt2:F.p0,y2Max:100,empty:noData('Equipment_Pareto')}),
      lines.length>1?chart('Downtime by category and line',{span:12,kind:'bar',labels:BUCKETS,sets:lines.map((l,i)=>({label:l,data:BUCKETS.map(k=>sum(Y.filter(r=>r.Line===l&&r.Bucket===k),'Hours'))})),fmt:F.n1}):
        (x=>chart('Downtime by category and month',{span:12,kind:'stack',hint:'Hours',labels:x.labels,sets:BUCKETS.map(b=>({label:b,data:x.keys.map(k=>sum(Y.filter(r=>ymKey(r)===k&&r.Bucket===b),'Hours'))})),fmt:F.n0}))(byMonth(Y,rs=>rs)),
      table('Downtime hours by category',{span:12,hint:'By month'+(lines.length>1?' and line':''),
        cols:[{h:'Month',k:'m',l:1},...(lines.length>1?[{h:'Line',k:'line',l:1}]:[]),...BUCKETS.map(b=>({h:b,k:b,fmt:F.n1})),{h:'Total',k:'tot',fmt:F.n1}],rows:prow,total:ptot}),
    ];
  }});

page({sec:'sc',id:'downtime-analytics',title:'Bottling line downtime analytics',tab:'Downtime analytics',tables:['Fact_Downtime','Daily_2Week','Pareto_2Week','Dim_Category'],
  slicers:[monthSlicer(['Fact_Downtime','Daily_2Week','Pareto_2Week']),
    fieldSlicer('type','Type','Fact_Downtime',r=>typeOf(r.Category),{}),
    fieldSlicer('cat','Category','Fact_Downtime','Category')],
  build(c){
    const FD=c.rows('Fact_Downtime'),D=c.rows('Daily_2Week'),P=c.rows('Pareto_2Week');
    const split=byCat(FD,r=>typeOf(r.Category),rs=>sum(rs,'Hours'));
    const mon=byMonth(D,rs=>sum(rs,'DowntimeHours'));
    const days=uniq(D.map(r=>r.Date)).length;
    const par=byCat(P,'Contributor',rs=>sum(rs,'Minutes'));let cum=0;const ptot=par.data.reduce((a,b)=>a+(b||0),0);
    const prow=par.items.map(x=>{cum+=x.v||0;return {k:x.k,min:x.v,h:x.v/60,pct:ptot?x.v/ptot*100:null,cum:ptot?cum/ptot*100:null}});
    const mach=byCat(FD.filter(r=>typeOf(r.Category)==='Machine'),'Category',rs=>sum(rs,'Hours'),{top:5});
    const daily=[...D].sort((a,b)=>String(a.Date).localeCompare(String(b.Date)));
    const ins=[];
    if(prow.length)ins.push(`${prow[0].k} is the biggest contributor: ${fmtN(prow[0].h,1)} h, ${fmtN(prow[0].pct,1)}% of logged downtime.`);
    if(prow.length>2)ins.push(`The top 3 contributors (${prow.slice(0,3).map(x=>x.k).join(', ')}) make up ${fmtN(prow[2].cum,1)}% of downtime.`);
    const mt=split.items.find(x=>x.k==='Machine'),dl=split.items.find(x=>x.k==='Delay'),st=(mt?.v||0)+(dl?.v||0);
    if(st)ins.push(`Machine stoppages account for ${fmtN((mt?.v||0)/st*100,0)}% of categorised hours, delays ${fmtN((dl?.v||0)/st*100,0)}%.`);
    if(mon.data.length>1){const i=mon.data.indexOf(Math.max(...mon.data.filter(isNum)));ins.push(`${mon.labels[i]} had the most downtime (${fmtN(mon.data[i],1)} h).`)}
    if(days)ins.push(`Average downtime was ${fmtN(sum(D,'DowntimeHours')/days,1)} h per production day over ${days} days.`);
    return [
      card('Downtime hours',sum(D,'DowntimeHours'),{fmt:F.n1,unit:'h',span:3,foot:'Daily downtime log, selected months'}),
      card('Average per day',div(sum(D,'DowntimeHours'),days),{fmt:F.n1,unit:'h',span:3,foot:`Over ${days} logged days`}),
      card('Top contributor',prow.length?prow[0].k:null,{span:3,foot:'Largest share of downtime minutes',sub:prow.length?`${fmtN(prow[0].h,1)} h · ${fmtN(prow[0].pct,1)}%`:''}),
      card('Machine vs delay',st?`${fmtN((mt?.v||0)/st*100,0)}% / ${fmtN((dl?.v||0)/st*100,0)}%`:null,{span:3,foot:'Share of categorised hours'}),
      chart('Downtime hours by month',{kind:'line',labels:mon.labels,sets:[{label:'Hours',data:mon.data,vl:true}],fmt:F.n1}),
      chart('Machine vs delay split',{kind:'donut',labels:split.labels,sets:[{data:split.data}],fmt:F.h1}),
      chart('Daily downtime',{span:12,kind:'bar',hint:'Hours per day',labels:daily.map(r=>{const d=new Date(r.Date+'T00:00');return d.getDate()+' '+MONTHS[d.getMonth()]}),sets:[{label:'Hours',data:daily.map(r=>r.DowntimeHours)}],fmt:F.n1,vl:false}),
      table('Pareto analysis',{span:7,hint:'Downtime minutes by contributor',maxH:360,
        cols:[{h:'Contributor',k:'k',l:1},{h:'Minutes',k:'min',fmt:F.n0},{h:'Hours',k:'h',fmt:F.n1},{h:'Share',k:'pct',fmt:F.p1},{h:'Cumulative',k:'cum',fmt:F.p1}],rows:prow}),
      table('Top 5 machines',{span:5,hint:'Machine stoppages only',cols:[{h:'Machine',k:'k',l:1},{h:'Hours',k:'v',fmt:F.n1},{h:'Type',f:()=> 'Machine',l:1}],rows:mach.items}),
      text('Key insights',ins,{span:12}),
    ];
  }});

page({sec:'sc',id:'downtime-3yr',title:'Downtime 3-year comparison',tab:'3-year downtime',tables:['Fact_Downtime_3Yr'],
  slicers:[yearSlicer(['Fact_Downtime_3Yr']),fieldSlicer('month','Month','Fact_Downtime_3Yr',r=>MONTHS[r._m-1],{order:v=>v.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b))}),
    fieldSlicer('type','Type','Fact_Downtime_3Yr','Type')],
  build(c){
    const R=c.rows('Fact_Downtime_3Yr');const yrs=uniq(R.map(r=>r._y)).sort();
    const months=uniq(R.map(r=>r._m)).sort((a,b)=>a-b);
    const cards=yrs.slice(-4).map(y=>{const rs=R.filter(r=>r._y===y);const mm=uniq(rs.filter(r=>r.Hours>0).map(r=>r._m));return card(`${y} total`,sum(rs,'Hours'),{fmt:F.n1,unit:'h',span:3,foot:`${mm.length} month${mm.length===1?'':'s'} with data`})});
    const cats=byCat(R,'Category',rs=>sum(rs,'Hours'));
    const prow=cats.items.map(x=>{const o={k:x.k,type:typeOf(x.k)};yrs.forEach(y=>o[y]=sum(x.rs.filter(r=>r._y===y),'Hours'));return o});
    const tot={k:'Total',type:''};yrs.forEach(y=>tot[y]=sum(R.filter(r=>r._y===y),'Hours'));
    const types=uniq(R.map(r=>r.Type)).sort();
    const share=types.map(t=>yrs.map(y=>{const a=sum(R.filter(r=>r._y===y&&r.Type===t),'Hours')||0,b=sum(R.filter(r=>r._y===y),'Hours')||0;return b?a/b*100:null}));
    // like-for-like: the months the latest year has
    const ins=[];const ly=yrs[yrs.length-1];
    if(yrs.length>1){const lm=uniq(R.filter(r=>r._y===ly&&r.Hours>0).map(r=>r._m));const prev=yrs[yrs.length-2];
      const a=sum(R.filter(r=>r._y===ly&&lm.includes(r._m)),'Hours'),b=sum(R.filter(r=>r._y===prev&&lm.includes(r._m)),'Hours');
      if(a!=null&&b)ins.push(`Like for like (${lm.length} months, ${MONTHS[Math.min(...lm)-1]}–${MONTHS[Math.max(...lm)-1]}): ${ly} has ${fmtN(a,1)} h against ${fmtN(b,1)} h in ${prev}, ${chg(a,b)>0?'up':'down'} ${fmtN(Math.abs(chg(a,b)),1)}%.`)}
    if(cats.items.length)ins.push(`Biggest category across the selection: ${cats.items[0].k} (${fmtN(cats.items[0].v,1)} h).`);
    const lyCats=byCat(R.filter(r=>r._y===ly),'Category',rs=>sum(rs,'Hours'));if(lyCats.items.length)ins.push(`In ${ly} the top three are ${topLines(lyCats.items,F.h1)}.`);
    return [...cards,
      chart('Downtime hours by month and year',{span:12,kind:'bar',labels:months.map(m=>MONTHS[m-1]),sets:yrs.map(y=>({label:String(y),data:months.map(m=>sum(R.filter(r=>r._y===y&&r._m===m),'Hours'))})),fmt:F.n0,vl:false}),
      table('Downtime by category and year',{span:6,hint:'Hours',maxH:380,cols:[{h:'Category',k:'k',l:1},{h:'Type',k:'type',l:1},...yrs.map(y=>({h:String(y),k:y,fmt:F.n1}))],rows:prow,total:tot}),
      chart('Machine vs delay share by year',{span:6,kind:'stack100h',labels:yrs.map(String),sets:types.map((t,i)=>({label:t,data:share[i]})),fmt:v=>fmtN(v,1)+'%'}),
      text('Key insights',ins,{span:12}),
    ];
  }});

page({sec:'sc',id:'failure-modes',title:'Downtime failure modes',tab:'Failure modes',tables:['Failure_Modes'],
  slicers:[fieldSlicer('machine','Machine','Failure_Modes','Machine',{def:()=>{const b=byCat(T.Failure_Modes||[],'Machine',rs=>sum(rs,'Hours YTD'));return b.labels.length?[b.labels[0]]:[]}})],
  build(c){
    const R=c.rows('Failure_Modes');const fm=byCat(R,'Failure Mode',rs=>sum(rs,'Hours YTD'));
    const tot=sum(R,'Hours YTD');const top3=fm.items.slice(0,3);
    const ins=[];if(top3.length)ins.push(`Top failure mode: ${top3[0].k} with ${fmtN(top3[0].v,1)} h (${fmtN(top3[0].v/tot*100,1)}% of this selection).`);
    if(top3.length===3)ins.push(`The top three modes cover ${fmtN((top3[0].v+top3[1].v+top3[2].v)/tot*100,1)}% of downtime for the selection.`);
    ins.push(`${fm.items.length} different failure modes recorded.`);
    return [
      card('Downtime for selected machine',tot,{fmt:F.n1,unit:'h',span:4,foot:c.sel('machine').length?c.sel('machine').join(', '):'All machines',sub:`${fmtN(sum(R,'Minutes YTD'))} minutes, year to date`}),
      table('Top 3 failure modes',{span:4,cols:[{h:'Failure mode',k:'k',l:1},{h:'Hours',k:'v',fmt:F.n1},{h:'Share',f:r=>tot?r.v/tot*100:null,fmt:F.p1}],rows:top3}),
      text('Key insights',ins,{span:4}),
      chart('Hours by failure mode',{span:7,kind:'hbar',size:'xl',labels:fm.labels.slice(0,25),sets:[{label:'Hours',data:fm.data.slice(0,25)}],fmt:F.n1,hint:fm.labels.length>25?'Top 25 shown':''}),
      chart('Top 3 failure modes',{span:5,kind:'donut',size:'xl',labels:top3.map(x=>x.k),sets:[{data:top3.map(x=>x.v)}],fmt:F.h1,legendPos:'bottom'}),
    ];
  }});

page({sec:'sc',id:'efficiency',title:'Production efficiency',tab:'Production efficiency',tables:['Fact_Efficiency','Cost_Ops_Comparison'],
  slicers:[yearSlicer(['Fact_Efficiency'],{def:()=>{const y=latestYear('Fact_Efficiency');return y?[y]:[]}}),monthSlicer(['Fact_Efficiency']),
    fieldSlicer('fam','Product family','Fact_Efficiency','Product Family'),segSlicer('view','View',['Cases','Share of total'],'Cases')],
  build(c){
    const R=c.rows('Fact_Efficiency');const share=c.one('view')==='Share of total';
    const cases=sum(R,'Cases Bottled');const months=uniq(R.map(ymKey));
    const wEff=div(sum(R,r=>isNum(r['Line Efficiency %'])&&isNum(r['Cases Bottled'])?r['Line Efficiency %']*r['Cases Bottled']:null),sum(R.filter(r=>isNum(r['Line Efficiency %'])),'Cases Bottled'));
    // cost per case: operating cost ÷ cases bottled, for the selected months that have cost figures
    const COST=c.all('Cost_Ops_Comparison');const cm=new Set(COST.map(ymKey));const Bc=R.filter(r=>cm.has(ymKey(r)));const costM=new Set(Bc.map(ymKey));
    const cpc=c.sel('fam').length?null:div(sum(COST.filter(r=>costM.has(ymKey(r))),'Total Ops Cost'),sum(Bc,'Cases Bottled'));
    const B=R;
    const m=byMonth(R,rs=>sum(rs,'Cases Bottled'));const mtot=m.data.reduce((a,b)=>a+(b||0),0);
    const eff=byMonth(R,rs=>div(sum(rs,r=>isNum(r['Line Efficiency %'])&&isNum(r['Cases Bottled'])?r['Line Efficiency %']*r['Cases Bottled']:null),sum(rs.filter(r=>isNum(r['Line Efficiency %'])),'Cases Bottled')));
    const fam=byCat(B,'Product Family',rs=>sum(rs,'Cases Bottled'));const ftot=sum(B,'Cases Bottled');
    const topF=byCat(R,'Product Family',rs=>sum(rs,'Cases Bottled'),{top:8}).labels;
    const stackKeys=m.keys;
    const stackSets=[...topF,'Other'].map((f,i)=>({label:f,data:stackKeys.map(k=>{const rs=R.filter(r=>ymKey(r)===k&&(f==='Other'?!topF.includes(r['Product Family']):r['Product Family']===f));const v=sum(rs,'Cases Bottled');const t=sum(R.filter(r=>ymKey(r)===k),'Cases Bottled');return share?(v!=null&&t?v/t*100:null):v})})).filter(s=>s.data.some(x=>x));
    const effFam=byCat(R,'Product Family',rs=>avg(rs,'Line Efficiency %'));
    const catD=byCat(R,'Category',rs=>sum(rs,'Cases Bottled'));
    return [
      card('Cases produced',cases,{span:3,foot:`${months.length} month${months.length===1?'':'s'}, Gross Efficiency log`}),
      card('Average cases per month',div(cases,months.length),{span:2,foot:'Cases ÷ months'}),
      card('Line efficiency',wEff,{fmt:F.p1,span:2,foot:'Weighted by cases bottled'}),
      card('BBT volume',sum(R,'BBT HLs'),{fmt:F.n0,unit:'hl',span:2,foot:'Bright beer tank hectolitres'}),
      card('Cost per case',cpc,{fmt:F.ec2,span:3,na:c.sel('fam').length?'All products only':'No cost figures',foot:costM.size?`Operating cost ÷ cases, ${[...costM].sort().map(k=>ymLabel(k,true)).join(', ')}`:'No cost figures for these months'}),
      chart('Line efficiency by month',{kind:'line',labels:eff.labels,sets:[{label:'Line efficiency %',data:eff.data,vl:true}],fmt:F.p1,zero:false}),
      chart(share?'Share of cases by month':'Cases produced by month',{kind:'bar',labels:m.labels,sets:[{label:share?'Share %':'Cases',data:share?m.data.map(v=>mtot?v/mtot*100:null):m.data,color:PAL[1]}],fmt:share?F.p1:F.big}),
      chart(share?'Share of cases by product family':'Cases produced by product family',{kind:'hbar',size:'xl',hint:'Gross Efficiency log',labels:fam.labels,sets:[{label:share?'Share %':'Cases',data:share?fam.data.map(v=>ftot?v/ftot*100:null):fam.data}],fmt:share?F.p1:F.n0}),
      chart(share?'Product mix by month (share of cases)':'Cases by product family and month',{kind:'stack',size:'xl',hint:'Top 8 families, the rest grouped as Other',labels:m.labels,sets:stackSets,fmt:share?F.p0:F.big}),
      chart('Average line efficiency by product family',{kind:'hbar',size:'lg',labels:effFam.labels,sets:[{label:'Line efficiency %',data:effFam.data,color:PAL[2]}],fmt:F.p1}),
      chart('Cases by category',{kind:'donut',size:'lg',labels:catD.labels,sets:[{data:catD.data}],fmt:F.n0}),
    ];
  }});
