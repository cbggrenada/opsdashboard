
/* =============================================================
   KPI SCORECARD (KPI_Model.pbix)
   ============================================================= */
// lower is better for these (same list as the Power BI "KPI Status" measure)
const LOWER_BETTER=['water hl/hl','fuel l/hl','electricity kw/hl','c02 kg/hl','co2 kg/hl','process loss v%','total bottling loss %'];
const lowerBetter=k=>LOWER_BETTER.includes(String(k).toLowerCase().trim());
const isCount=k=>/cases/i.test(k);
const kpiFmt=k=>isCount(k)?F.n0:F.n1;
function kpiAgg(rs,k,col){const v=nums(rs,col);if(!v.length)return null;return isCount(k)?v.reduce((a,b)=>a+b,0):v.reduce((a,b)=>a+b,0)/v.length}
const stPill=s=>s?`<span class="pill ${s==='good'?'g':'b'}">${s==='good'?'On target':'Off target'}</span>`:'<span class="m">–</span>';
const latestMonthDef=t=>()=>{const ks=uniq((T[t]||[]).map(ymKey).filter(Boolean)).sort();return ks.slice(-1)};

page({sec:'kpi',id:'scorecard',title:'Supply chain KPI scorecard',tab:'Scorecard',tables:['Scorecard_Monthly'],
  slicers:[monthSlicer(['Scorecard_Monthly'],{def:latestMonthDef('Scorecard_Monthly')})],
  barNote:'Several months: cases are added up, other KPIs are averaged.',
  build(c){
    const R=c.rows('Scorecard_Monthly');const ks=uniq(R.map(ymKey)).sort();const last=ks[ks.length-1];
    const kpis=[...group(R,r=>r.KPI).entries()].sort((a,b)=>(a[1][0]['KPI Sort']||0)-(b[1][0]['KPI Sort']||0));
    const rows=[];let lastDept=null;let on=0,off=0;const deptStat={};
    for(const [k,rs] of kpis){
      const d=rs[0].Department||'';if(d!==lastDept){rows.push({_grp:d});lastDept=d}
      const a=kpiAgg(rs,k,'Actual'),b=kpiAgg(rs,k,'Budget'),py=kpiAgg(rs,k,'Prior Year');const ytdR=rs.find(r=>ymKey(r)===last);
      const st=status(a,b,!lowerBetter(k));if(st==='good')on++;else if(st==='bad')off++;
      deptStat[d]=deptStat[d]||{on:0,n:0};if(st){deptStat[d].n++;if(st==='good')deptStat[d].on++}
      rows.push({k,a,b,py,ytd:ytdR?ytdR.YTD:null,st,vs:a!=null&&b!=null?a-b:null});
    }
    const n=on+off;
    return [
      row([card('KPIs on target',on,{st:'good',foot:`Out of ${n} with a budget`,sub:n?`${fmtN(on/n*100,0)}% on target`:''}),card('KPIs off target',off,{st:off?'bad':'good',foot:'Actual worse than budget'}),
        ...Object.entries(deptStat).filter(([d,s])=>s.n).map(([d,s])=>card(d,`${s.on} of ${s.n}`,{foot:'KPIs on target',st:s.on===s.n?'good':s.on===0?'bad':'warn'}))]),
      table('Scorecard',{span:12,hint:ks.length?`${ks.length===1?ymLabel(ks[0]):ks.length+' months: '+ymLabel(ks[0])+' to '+ymLabel(last)} · YTD column is the year to date at ${ymLabel(last)}${R.some(r=>r._calc)?' · '+uniq(R.filter(r=>r._calc).map(ymKey)).sort().map(ymLabel).join(', ')+' worked out from the raw files (no Ops KPIs MD report or SCTCM report for it yet), so plant availability and the bottling detail KPIs are not shown':''}`:'',maxH:900,
        cols:[{h:'KPI',k:'k',l:1},{h:'Actual',k:'a',fmt:(v,r)=>kpiFmt(r.k)(v)},{h:'Budget',k:'b',fmt:(v,r)=>kpiFmt(r.k)(v)},{h:'Prior year',k:'py',fmt:(v,r)=>kpiFmt(r.k)(v)},
          {h:'vs budget',k:'vs',fmt:(v,r)=>{if(v==null)return '–';const t=kpiFmt(r.k)(v);return /^-0(\.0+)?$/.test(t)?t.slice(1):(v>0?'+':'')+t},cls:(v,r)=>r.st==='good'?'g':r.st==='bad'?'b':''},{h:'YTD',k:'ytd',fmt:(v,r)=>kpiFmt(r.k)(v)},{h:'Status',k:'st',html:1,l:1,fmt:stPill}],rows}),
    ];
  }});

page({sec:'kpi',id:'kpi-trends',title:'KPI trends',tab:'KPI trends',tables:['Scorecard_Monthly'],
  slicers:[fieldSlicer('kpi','KPI','Scorecard_Monthly','KPI',{kind:'single',order:v=>v.sort((a,b)=>((T.Scorecard_Monthly.find(r=>r.KPI===a)||{})['KPI Sort']||0)-((T.Scorecard_Monthly.find(r=>r.KPI===b)||{})['KPI Sort']||0))}),monthSlicer(['Scorecard_Monthly'])],
  build(c){
    const k=c.one('kpi');const all=c.rows('Scorecard_Monthly',['kpi']);const R=all.filter(r=>r.KPI===k);
    const m=byMonth(R,rs=>rs[0]);const f=kpiFmt(k);
    const ks=uniq(all.map(ymKey)).sort();
    const pv=[...group(all,r=>r.KPI).entries()].sort((a,b)=>(a[1][0]['KPI Sort']||0)-(b[1][0]['KPI Sort']||0)).map(([kk,rs])=>{const o={k:kk};ks.forEach(x=>{const r=rs.find(y=>ymKey(y)===x);o[x]=r?r.Actual:null;o['s'+x]=r?status(r.Actual,r.Budget,!lowerBetter(kk)):null});return o});
    const last=R[R.length-1];
    return [
      row([card('Latest actual',last?last.Actual:null,{fmt:f,foot:last?ymLabel(ymKey(last)):'',st:last?status(last.Actual,last.Budget,!lowerBetter(k))||'':''}),card('Budget',last?last.Budget:null,{fmt:f}),card('Prior year',last?last['Prior Year']:null,{fmt:f}),card('Year to date',last?last.YTD:null,{fmt:f,foot:lowerBetter(k)?'Lower is better':'Higher is better'})]),
      chart(`${k||''}: actual vs budget and prior year`,{span:12,kind:'bar',labels:m.labels,
        sets:[{label:'Actual',data:m.data.map(r=>r&&r.Actual),colors:m.data.map(r=>r&&status(r.Actual,r.Budget,!lowerBetter(k))==='bad'?'#C0392B':'#01427A')},{label:'Budget',data:m.data.map(r=>r&&r.Budget),type:'line',color:PAL[1],dash:[6,4]},{label:'Prior year',data:m.data.map(r=>r&&r['Prior Year']),type:'line',color:PAL[5]}],fmt:f,zero:false}),
      table('All KPIs by month',{span:12,hint:'Actual · green on target, red off target',
        cols:[{h:'KPI',k:'k',l:1},...ks.map(x=>({h:ymLabel(x,oneYear(ks)),k:x,fmt:(v,r)=>kpiFmt(r.k)(v),cls:(v,r)=>r['s'+x]==='good'?'g':r['s'+x]==='bad'?'b':''}))],rows:pv}),
    ];
  }});

page({sec:'kpi',id:'production-loss',title:'Production and loss',tab:'Production and loss',tables:['Fact_ExtractLoss','Fact_BrewsPerDay_Monthly','Fact_Export'],
  slicers:[monthSlicer(['Fact_ExtractLoss','Fact_BrewsPerDay_Monthly'],{}),fieldSlicer('stage','Stage','Fact_ExtractLoss','Stage',{order:v=>v})],
  build(c){
    const X=c.rows('Fact_ExtractLoss');const stages=uniq(X.map(r=>r.Stage));
    const ks=uniq(X.map(ymKey)).sort();const labs=ks.map(k=>ymLabel(k,oneYear(ks)));
    const ov=X.filter(r=>r.Stage==='Overall');const ovm=byMonth(ov,rs=>rs[0]);
    const B=c.rows('Fact_BrewsPerDay_Monthly');const bm=byMonth(B,rs=>rs[0]);
    const E=c.all('Fact_Export');const ey=uniq(E.map(r=>r._y)).sort();const em=uniq(E.map(r=>r._m)).sort((a,b)=>a-b);
    const lastOv=ov.length?ov[ov.length-1]:null;
    return [
      row([card('Overall extract loss',lastOv?lastOv.LossPct:null,{fmt:F.p1,foot:lastOv?`${ymLabel(ymKey(lastOv))}, target ${fmtN(lastOv.TargetPct,1)}%`:'',st:lastOv?status(lastOv.LossPct,lastOv.TargetPct,false)||'':''}),
        card('Average overall loss',avg(ov,'LossPct'),{fmt:F.p1,foot:`${ov.length} months`}),
        card('Brews per day',bm.data.length?bm.data[bm.data.length-1]['Brews Per Day']:null,{fmt:F.n1,foot:bm.labels.length?`${bm.labels[bm.labels.length-1]}, budget ${fmtN(bm.data[bm.data.length-1].Budget,1)}`:'',st:bm.data.length?status(bm.data[bm.data.length-1]['Brews Per Day'],bm.data[bm.data.length-1].Budget)||'':''}),
        card('Export cases',sum(E.filter(r=>r._y===ey[ey.length-1]),'Cases'),{foot:`${ey[ey.length-1]||''} to date`})]),
      chart('Extract loss by stage',{span:12,kind:'line',hint:'% of extract lost at each stage',labels:labs,sets:stages.map(s=>({label:s,data:ks.map(k=>{const r=X.find(x=>x.Stage===s&&ymKey(x)===k);return r?r.LossPct:null}),dash:s==='Overall'?[]:undefined})),fmt:F.p1}),
      chart('Overall extract loss vs target',{kind:'bar',labels:ovm.labels,sets:[{label:'Overall loss %',data:ovm.data.map(r=>r&&r.LossPct),colors:ovm.data.map(r=>r&&status(r.LossPct,r.TargetPct,false)==='bad'?'#C0392B':'#01427A')},{label:'Target %',data:ovm.data.map(r=>r&&r.TargetPct),type:'line',color:PAL[1],dash:[6,4]}],fmt:F.p1,empty:'No "Overall" stage rows for this selection.'}),
      chart('Brews per day',{kind:'bar',labels:bm.labels,sets:[{label:'Brews per day',data:bm.data.map(r=>r&&r['Brews Per Day'])},{label:'Budget',data:bm.data.map(r=>r&&r.Budget),type:'line',color:PAL[1],dash:[6,4]}],fmt:F.n1}),
      chart('Export production (cases)',{span:12,kind:'bar',hint:'Not affected by the month filter',labels:em.map(m=>MONTHS[m-1]),sets:ey.map(y=>({label:String(y),data:em.map(m=>sum(E.filter(r=>r._y===y&&r._m===m),'Cases'))})),fmt:F.n0,notes:notesFor('Fact_Export')}),
    ];
  }});

const UT=[{u:'Water',k:'Water hl/hl',unit:'hl',ratio:'hl/hl'},{u:'Fuel',k:'Fuel L/hl',unit:'L',ratio:'L/hl'},{u:'Electricity',k:'Electricity Kw/hl',unit:'kWh',ratio:'kWh/hl'},{u:'CO2',k:'C02 Kg/hl',unit:'kg',ratio:'kg/hl'}];
page({sec:'kpi',id:'utilities-monthly',title:'Utilities monthly',tab:'Utilities monthly',tables:['Fact_Utilities_Monthly','Scorecard_Monthly'],
  slicers:[monthSlicer(['Fact_Utilities_Monthly','Scorecard_Monthly'])],
  build(c){
    const U=c.rows('Fact_Utilities_Monthly'),S=c.rows('Scorecard_Monthly');
    const ks=uniq([...U.map(ymKey),...S.filter(r=>UT.some(x=>x.k===r.KPI)).map(ymKey)]).sort();const labs=ks.map(k=>ymLabel(k,oneYear(ks)));
    const out=[];
    const tiles=UT.map(x=>{const rs=S.filter(r=>r.KPI===x.k);const l=rs.sort((a,b)=>ymKey(a).localeCompare(ymKey(b)))[rs.length-1];
      return card(`${x.u==='CO2'?'CO₂':x.u} ${x.ratio}`,l?l.Actual:null,{fmt:F.n1,foot:l?`${ymLabel(ymKey(l))} · budget ${fmtN(l.Budget,1)}`:'',st:l?status(l.Actual,l.Budget,false)||'':'',sub:l&&l.YTD!=null?`YTD ${fmtN(l.YTD,1)}`:''})});
    out.push(row(tiles));
    for(const x of UT){
      const used=ks.map(k=>sum(U.filter(r=>r.Utility===x.u&&ymKey(r)===k),'Value'));
      const rat=ks.map(k=>{const r=S.find(y=>y.KPI===x.k&&ymKey(y)===k);return r?r.Actual:null});
      const bud=ks.map(k=>{const r=S.find(y=>y.KPI===x.k&&ymKey(y)===k);return r?r.Budget:null});
      out.push(chart(`${x.u==='CO2'?'CO₂':x.u}: ${x.ratio}`,{span:6,kind:'bar',hint:`Bars: ${x.unit} used · line: ${x.ratio} against budget (dashed)`,labels:labs,
        sets:[{label:`${x.unit} used`,data:used,color:'#B5D3EE',vl:false},{label:x.ratio,data:rat,type:'line',axis:'y2',color:PAL[0],vl:true},{label:'Budget',data:bud,type:'line',axis:'y2',color:PAL[1],dash:[6,4]}],fmt:F.big,fmt2:F.n1,zero2:false,vl:false}));
    }
    const pm=byMonth(S.filter(r=>/maintenance compliance/i.test(r.KPI)),rs=>rs[0]);
    out.push(chart('PM compliance %',{span:12,kind:'bar',labels:pm.labels,sets:[{label:'PM compliance %',data:pm.data.map(r=>r&&r.Actual),colors:pm.data.map(r=>r&&r.Budget!=null&&r.Actual<r.Budget?'#C0392B':'#01427A')},{label:'Budget',data:pm.data.map(r=>r&&r.Budget),type:'line',color:PAL[1],dash:[6,4]}],fmt:F.p0}));
    const sol=ks.map(k=>sum(U.filter(r=>r.Utility==='Solar'&&ymKey(r)===k),'Value'));
    if(sol.some(v=>v))out.push(chart('Solar generation',{span:12,kind:'bar',hint:'kWh per month',labels:labs,sets:[{label:'Solar kWh',data:sol,color:PAL[1]}],fmt:F.big}));
    return out;
  }});

page({sec:'kpi',id:'utilities-weekly',title:'Utilities weekly',tab:'Utilities weekly',tables:['Fact_Utilities_Weekly'],
  slicers:[monthSlicer(['Fact_Utilities_Weekly'],{def:()=>{const ks=uniq((T.Fact_Utilities_Weekly||[]).map(ymKey).filter(Boolean)).sort();return ks.slice(-3)}}),segSlicer('basis','Show',['Total for the week','Per day'],'Total for the week')],
  build(c){
    const W=c.rows('Fact_Utilities_Weekly');const perDay=c.one('basis')==='Per day';
    const wk=[...group(W,r=>`${r._y}-${pad(r._m)}-${r.Week}`).keys()].sort();
    const lab=k=>{const r=W.find(x=>`${x._y}-${pad(x._m)}-${x.Week}`===k);return r?(r.WeekLabel||`${MONTHS[r._m-1]} ${r.Week}`):k};
    const out=[];
    for(const x of [...UT,{u:'Solar',unit:'kWh'}]){
      const data=wk.map(k=>{const rs=W.filter(r=>r.Utility===x.u&&`${r._y}-${pad(r._m)}-${r.Week}`===k);const v=sum(rs,'Value');const d=sum(rs,'Days');return perDay?div(v,d):v});
      if(!data.some(v=>v))continue;
      out.push(chart(`${x.u==='CO2'?'CO₂':x.u} (${x.unit}${perDay?' per day':''})`,{span:6,kind:'bar',hint:'W5 is the short end-of-month week',labels:wk.map(lab),sets:[{label:x.unit,data,color:PAL[UT.findIndex(y=>y.u===x.u)+1]||PAL[0]}],fmt:F.big,vl:wk.length<=10}));
    }
    return out;
  }});

page({sec:'kpi',id:'quality',title:'Quality and complaints',tab:'Quality and complaints',tables:['Fact_Complaints','Fact_ComplaintsBrand'],
  slicers:[yearSlicer(['Fact_Complaints'],{def:()=>uniq((T.Fact_Complaints||[]).map(r=>r._y)).sort().slice(-2)}),fieldSlicer('month','Month','Fact_Complaints',r=>MONTHS[r._m-1],{order:v=>v.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b))})],
  build(c){
    const R=c.rows('Fact_Complaints');const yrs=uniq(R.map(r=>r._y)).sort();const ms=uniq(R.map(r=>r._m)).sort((a,b)=>a-b);
    const B=c.all('Fact_ComplaintsBrand');const br=byCat(B,'Brand',rs=>sum(rs,'JustifiedComplaints'));
    const cards=yrs.slice(-3).map(y=>card(`${y} justified complaints`,sum(R.filter(r=>r._y===y),'JustifiedComplaints'),{foot:`${uniq(R.filter(r=>r._y===y).map(r=>r._m)).length} months`}));
    return [row(cards),
      chart('Justified complaints by month',{span:7,kind:'line',labels:ms.map(m=>MONTHS[m-1]),sets:yrs.map(y=>({label:String(y),data:ms.map(m=>{const r=R.find(x=>x._y===y&&x._m===m);return r?r.JustifiedComplaints:null}),vl:true})),fmt:F.n0,notes:notesFor('Fact_Complaints')}),
      chart('Justified complaints by brand, year to date',{span:5,kind:'donut',labels:br.labels,sets:[{data:br.data}],fmt:F.n0,hint:'Not affected by the filters',notes:notesFor('Fact_ComplaintsBrand')}),
    ];
  }});

page({sec:'kpi',id:'cost',title:'Cost per case',tab:'Cost',tables:['Fact_CostPerCase','Fact_CostPerCaseMonthly'],
  slicers:[],
  build(c){
    const R=c.all('Fact_CostPerCase');const M=c.all('Fact_CostPerCaseMonthly');const mm=byMonth(M,rs=>rs[0]);
    const over=R.filter(r=>isNum(r.ActualYTD_EC)&&isNum(r.BudgetYTD_EC)&&r.ActualYTD_EC>r.BudgetYTD_EC);
    const big=[...R].sort((a,b)=>(b.ActualYTD_EC||0)-(a.ActualYTD_EC||0))[0];
    const gap=[...over].sort((a,b)=>(b.ActualYTD_EC-b.BudgetYTD_EC)-(a.ActualYTD_EC-a.BudgetYTD_EC))[0];
    const lm=mm.data.length?mm.data[mm.data.length-1]:null;
    return [
      row([card('Latest monthly cost per case',lm?lm.Actual_EC:null,{fmt:F.ec2,foot:lm?`${mm.labels[mm.labels.length-1]} · budget ${F.ec2(lm.Budget_EC)}`:'',st:lm?status(lm.Actual_EC,lm.Budget_EC,false)||'':''}),
        card('Categories over budget',over.length,{foot:`Out of ${R.length} cost categories`,st:over.length?'bad':'good'}),
        card('Largest category',big?big.Category:null,{foot:big?`${F.ec2(big.ActualYTD_EC)} per case, YTD`:''}),
        card('Biggest overrun',gap?gap.Category:null,{foot:gap?`${F.ec2(gap.ActualYTD_EC)} vs budget ${F.ec2(gap.BudgetYTD_EC)}`:''})]),
      chart('Cost per case by category (EC$), year to date',{span:7,kind:'hbar',size:'xl',labels:R.map(r=>r.Category),sets:[{label:'Actual',data:R.map(r=>r.ActualYTD_EC)},{label:'Budget',data:R.map(r=>r.BudgetYTD_EC),color:PAL[5]}],fmt:F.n2,notes:notesFor('Fact_CostPerCase')}),
      chart('Cost per case by month (EC$)',{span:5,kind:'bar',size:'xl',labels:mm.labels,sets:[{label:'Actual',data:mm.data.map(r=>r&&r.Actual_EC)},{label:'Budget',data:mm.data.map(r=>r&&r.Budget_EC),color:PAL[5]}],fmt:F.n2,notes:notesFor('Fact_CostPerCaseMonthly')}),
    ];
  }});

page({sec:'kpi',id:'forecast',title:'Forecast accuracy',tab:'Forecast',tables:['Fact_Forecast'],
  slicers:[yearSlicer(['Fact_Forecast'],{def:()=>uniq((T.Fact_Forecast||[]).map(r=>r._y)).sort().slice(-2)})],
  build(c){
    const R=c.rows('Fact_Forecast');const yrs=uniq(R.map(r=>r._y)).sort();const ms=uniq(R.map(r=>r._m)).sort((a,b)=>a-b);
    const tgt=avg(R,'TargetPct');
    return [row(yrs.map(y=>{const rs=R.filter(r=>r._y===y);const a=avg(rs,'AccuracyPct');return card(`${y} average accuracy`,a,{fmt:F.p1,st:status(a,avg(rs,'TargetPct'))||'',foot:`${rs.length} months · target ${fmtN(avg(rs,'TargetPct'),0)}%`})})),
      chart('Forecast accuracy % by month',{span:12,kind:'bar',labels:ms.map(m=>MONTHS[m-1]),sets:yrs.map((y,i)=>({label:String(y),data:ms.map(m=>{const r=R.find(x=>x._y===y&&x._m===m);return r?r.AccuracyPct:null}),color:i===yrs.length-1?PAL[0]:PAL[2]})),refs:tgt!=null?[{v:tgt,label:`Target ${fmtN(tgt,0)}%`,color:'#E0A21B'}]:[],fmt:F.p0,notes:notesFor('Fact_Forecast')}),
    ];
  }});

page({sec:'kpi',id:'cases',title:'Cases produced',tab:'Cases produced',tables:['Cases_Monthly','Cases_By_Brand'],
  slicers:[yearSlicer(['Cases_Monthly','Cases_By_Brand'],{def:()=>{const y=latestYear('Cases_Monthly');return y?[y]:[]}}),monthSlicer(['Cases_Monthly','Cases_By_Brand'])],
  build(c){
    const M=c.rows('Cases_Monthly'),B=c.rows('Cases_By_Brand');const mm=byMonth(M,rs=>sum(rs,'Cases Produced'));
    const last=mm.data.length?mm.data[mm.data.length-1]:null;
    const fam=byCat(B,'Product Family',rs=>sum(rs,'Cases Produced'));const cat=byCat(B,'Category',rs=>sum(rs,'Cases Produced'));
    return [
      row([card('Cases produced',sum(M,'Cases Produced'),{foot:`${mm.labels.length} months`}),card('Latest month',last,{foot:mm.labels[mm.labels.length-1]||''}),card('Average per month',div(sum(M,'Cases Produced'),mm.labels.length)),card('Best month',mm.data.length?Math.max(...mm.data):null,{foot:mm.labels[mm.data.indexOf(Math.max(...mm.data))]||''})]),
      chart('Cases produced by product family',{span:6,kind:'hbar',size:'xl',labels:fam.labels,sets:[{label:'Cases',data:fam.data}],fmt:F.n0}),
      chart('Cases produced by month',{span:6,kind:'bar',size:'lg',labels:mm.labels,sets:[{label:'Cases',data:mm.data,color:PAL[1]}],fmt:F.big}),
      chart('Cases by category',{span:6,kind:'donut',size:'sm',labels:cat.labels,sets:[{data:cat.data}],fmt:F.n0}),
    ];
  }});

page({sec:'kpi',id:'actual-budget',title:'Actual vs budget, cases produced',tab:'Actual vs budget',tables:['Cases_Monthly'],
  slicers:[yearSlicer(['Cases_Monthly'],{def:()=>{const y=latestYear('Cases_Monthly');return y?[y]:[]}}),monthSlicer(['Cases_Monthly'])],
  build(c){
    const M=[...c.rows('Cases_Monthly')].sort((a,b)=>ymKey(a).localeCompare(ymKey(b)));const labs=M.map(r=>ymLabel(ymKey(r),oneYear(M.map(ymKey))));
    const a=sum(M,'Cases Produced'),b=sum(M,'Budget Cases');let ca=0,cb=0;
    const cumA=M.map(r=>ca+=r['Cases Produced']||0),cumB=M.map(r=>cb+=r['Budget Cases']||0);
    return [
      row([card('Cases produced',a),card('Budget cases',b),card('Attainment',div(a,b)==null?null:div(a,b)*100,{fmt:F.p1,st:a!=null&&b?(a>=b?'good':'bad'):'',sub:a!=null&&b!=null?`${a>=b?'+':''}${fmtN(a-b)} cases vs budget`:''})]),
      chart('Monthly production vs budget',{kind:'bar',size:'lg',labels:labs,sets:[{label:'Actual',data:M.map(r=>r['Cases Produced']),colors:M.map(r=>r['Cases Produced']<r['Budget Cases']?'#C0392B':'#01427A')},{label:'Budget',data:M.map(r=>r['Budget Cases']),type:'line',color:PAL[1],dash:[6,4]}],fmt:F.big}),
      chart('Year-to-date production vs budget, cumulative',{kind:'line',size:'lg',labels:labs,sets:[{label:'Actual, cumulative',data:cumA},{label:'Budget, cumulative',data:cumB,color:PAL[1],dash:[6,4]}],fmt:F.big}),
      table('Monthly attainment',{span:12,cols:[{h:'Month',f:r=>r._t?'Total':ymLabel(ymKey(r)),l:1},{h:'Actual',k:'Cases Produced',fmt:F.n0},{h:'Budget',k:'Budget Cases',fmt:F.n0},{h:'Variance',f:r=>r['Cases Produced']-r['Budget Cases'],fmt:v=>(v>0?'+':'')+fmtN(v),cls:v=>v>=0?'g':'b'},{h:'Attainment',f:r=>div(r['Cases Produced'],r['Budget Cases'])*100,fmt:F.p1}],rows:M,
        total:{_t:1,'Cases Produced':a,'Budget Cases':b}}),
    ];
  }});
