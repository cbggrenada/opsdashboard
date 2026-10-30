
/* =============================================================
   PACKAGING PERFORMANCE (one-page overview, like Brewing)
   Sources: Daily bottling summary (cases, plan, rejects), Gross Efficiency (line efficiency,
   available time), packaging loss (BBT vs bottled hl), line downtime log, and OEE from the
   MD report / SCTCM scorecard.
   ============================================================= */
const PKG_T=['Fact_Bottling','Fact_Efficiency','Fact_Packaging','Fact_Downtime'];
// line efficiency weighted by cases bottled, as on the Production efficiency page
const pkgEff=rs=>div(sum(rs,r=>isNum(r['Line Efficiency %'])&&isNum(r['Cases Bottled'])?r['Line Efficiency %']*r['Cases Bottled']:null),sum(rs.filter(r=>isNum(r['Line Efficiency %'])),'Cases Bottled'));
// cases per hour as the SCTCM report counts it: cases bottled ÷ available hours
const pkgCph=rs=>div(sum(rs,'Cases Bottled'),div(sum(rs,'Available Time'),60));
const pkgLoss=rs=>{const v=div(sum(rs,'Loss HLs'),sum(rs,'BBT HLs'));return v==null?null:v*100};
page({sec:'pkg',id:'packaging',title:'Packaging Performance YTD',tab:'Packaging Performance YTD',tables:[...PKG_T,'Production_KPIs'],
  slicers:[monthSlicer(PKG_T),
    fieldSlicer('fam','Product family','Fact_Bottling','Product Family',{also:{Fact_Efficiency:r=>r['Product Family'],Fact_Packaging:r=>r['Product Family']}}),
    fieldSlicer('cat','Category','Fact_Bottling','Category',{also:{Fact_Efficiency:r=>r.Category,Fact_Packaging:r=>r.Category}})],
  build(c){
    const B=c.rows('Fact_Bottling'),E=c.rows('Fact_Efficiency'),P=c.rows('Fact_Packaging'),D=c.rows('Fact_Downtime');
    const prodFilter=c.sel('fam').length||c.sel('cat').length;const NA='All products only';const EMPTY='No packaging data for this selection.';
    const cases=sum(B,'Cases Bottled'),days=uniq(B.map(r=>r.Date)).length;
    // plan attainment over runs that carry a planned figure (some runs continue an earlier plan and have none)
    const planned=B.filter(r=>isNum(r['Cases Planned'])&&r['Cases Planned']>0);
    const att=div(sum(planned,'Cases Bottled'),sum(planned,'Cases Planned'));
    const eff=pkgEff(E),cph=pkgCph(E),loss=pkgLoss(P);
    const rej=div(sum(B,'Rejects'),cases);
    const dt=prodFilter?null:sum(D,'Hours');
    // OEE from the monthly KPI figures: the month on its own, or year to date at the latest month picked
    const ms=uniq([...B,...E].map(ymKey).filter(Boolean)).sort();
    const K=c.all('Production_KPIs').filter(r=>r.KPI==='OEE'&&ms.includes(ymKey(r)));
    const kLast=uniq(K.map(ymKey)).sort().pop();
    const oeeRow=K.find(r=>ymKey(r)===kLast&&r.Period===(ms.length>1?'YTD':'MTD'));
    const oee=prodFilter?null:oeeRow?oeeRow.Actual:null,oeeT=oeeRow?oeeRow.Budget:null;
    const lossSt=loss==null?'':loss<1.5?'good':loss<3?'warn':'bad';
    // month by month
    const mB=byMonth(B,rs=>rs),keys=mB.keys;
    const mE=byMonth(E,rs=>rs,keys),mP=byMonth(P,rs=>rs,keys),mD=byMonth(D,rs=>rs,keys);
    const dtTypes=['Machine','Delay'];
    const dCat=byCat(D,'Category',rs=>sum(rs,'Hours'),{top:8});
    const fam=byCat(B,'Product Family',rs=>sum(rs,'Cases Bottled'),{top:10,other:rs=>sum(rs,'Cases Bottled')});
    const effF=byCat(E.filter(r=>(r['Cases Bottled']||0)>0),'Product Family',pkgEff,{top:12});
    // monthly summary table
    const mrows=keys.map((k,i)=>{const b=mB.data[i]||[],e=mE.data[i]||[],p=mP.data[i]||[],d=mD.data[i]||[];const pl=b.filter(r=>isNum(r['Cases Planned'])&&r['Cases Planned']>0);
      return {m:mB.labels[i],cases:sum(b,'Cases Bottled'),att:(x=>x==null?null:x*100)(div(sum(pl,'Cases Bottled'),sum(pl,'Cases Planned'))),eff:pkgEff(e),cph:pkgCph(e),loss:pkgLoss(p),
        rej:(x=>x==null?null:x*1000)(div(sum(b,'Rejects'),sum(b,'Cases Bottled'))),dt:prodFilter?null:sum(d,'Hours')}});
    const total={m:'Total',cases,att:att==null?null:att*100,eff,cph,loss,rej:rej==null?null:rej*1000,dt};
    // insights
    const ins=[];
    const best=mrows.filter(r=>r.cases).reduce((a,b)=>!a||b.cases>a.cases?b:a,null);if(best&&mrows.length>1)ins.push(`Highest output: ${best.m} with ${fmtN(best.cases)} cases bottled.`);
    const effs=mrows.filter(r=>r.eff!=null);if(effs.length>1){const hi=effs.reduce((a,b)=>b.eff>a.eff?b:a),lo=effs.reduce((a,b)=>b.eff<a.eff?b:a);ins.push(`Line efficiency ranged from ${fmtN(lo.eff,1)}% in ${lo.m} to ${fmtN(hi.eff,1)}% in ${hi.m}.`)}
    if(dCat.items.length&&!prodFilter){const t=sum(D,'Hours');ins.push(`Biggest downtime causes: ${topLines(dCat.items,v=>fmtN(v,1)+' h')}${t?`, together ${fmtN(dCat.items.slice(0,3).reduce((a,x)=>a+(x.v||0),0)/t*100,0)}% of all downtime`:''}.`)}
    if(effF.items.length>1)ins.push(`Most efficient product family: ${effF.items[0].k} (${fmtN(effF.items[0].v,1)}%); least: ${effF.items[effF.items.length-1].k} (${fmtN(effF.items[effF.items.length-1].v,1)}%).`);
    if(prodFilter)ins.push('Downtime and OEE are recorded for the whole line, so they show only when no product family or category is picked.');
    return [
      card('Cases bottled',cases,{span:3,foot:`${fmtN(days)} production day${days===1?'':'s'}, daily bottling summary`}),
      card('Plan attainment',att==null?null:att*100,{fmt:F.p1,span:3,st:att==null?'':status(att*100,100),foot:'Cases bottled ÷ planned, runs with a plan',sub:planned.length<B.length?`${fmtN(B.length-planned.length)} run${B.length-planned.length===1?'':'s'} without a plan left out`:''}),
      card('Line efficiency',eff,{fmt:F.p1,span:3,foot:'Gross Efficiency, weighted by cases'}),
      card('Cases per hour',cph,{fmt:F.n0,span:3,foot:'Cases ÷ available hours, as in the SCTCM report'}),
      card('OEE',oee,{fmt:F.p1,span:3,na:prodFilter?NA:'No OEE figure yet',st:status(oee,oeeT)||'',foot:oeeRow?`${ms.length>1?'Year to date':'Month'} to ${ymLabel(kLast)}${oeeT!=null?` · target ${fmtN(oeeT,0)}%`:''}`:'Monthly figure from the MD report'}),
      card('Packaging loss',loss,{fmt:F.p2,span:3,st:lossSt,foot:'Loss ÷ BBT volume',sub:loss==null?'':`${fmtN(sum(P,'Loss HLs'),1)} hl lost`}),
      card('Rejects per 1,000 cases',rej==null?null:rej*1000,{fmt:F.n1,span:3,foot:`${fmtN(sum(B,'Rejects'))} rejects`}),
      card('Downtime',dt,{fmt:F.n1,unit:'h',span:3,na:NA,foot:'All stoppages, line downtime log'}),
      chart('Cases bottled vs plan by month',{kind:'bar',hint:'Planned shown for runs with a plan',labels:mB.labels,
        sets:[{label:'Planned',data:mB.data.map(rs=>rs&&sum(rs.filter(r=>isNum(r['Cases Planned'])&&r['Cases Planned']>0),'Cases Planned')),color:PAL[5]},{label:'Bottled',data:mB.data.map(rs=>rs&&sum(rs,'Cases Bottled'))}],fmt:F.big,empty:EMPTY}),
      chart('Line efficiency by month',{kind:'line',hint:'Weighted by cases bottled',labels:mE.labels,sets:[{label:'Line efficiency %',data:mE.data.map(rs=>rs&&pkgEff(rs)),vl:true}],fmt:F.p1,zero:false,empty:EMPTY}),
      chart('Cases per hour by month',{kind:'bar',hint:'Cases ÷ available hours',labels:mE.labels,sets:[{label:'Cases per hour',data:mE.data.map(rs=>rs&&pkgCph(rs)),color:PAL[2]}],fmt:F.n0,empty:EMPTY}),
      chart('Packaging loss by month',{kind:'line',hint:'Loss % of BBT volume',labels:mP.labels,sets:[{label:'Loss %',data:mP.data.map(rs=>rs&&pkgLoss(rs)),color:PAL[3],vl:true}],fmt:F.p2,zero:false,empty:EMPTY}),
      chart('Downtime by month',{kind:'stack',hint:prodFilter?'Whole line only: clear the product filters':'Hours, machine breakdowns vs delays',labels:mD.labels,
        sets:prodFilter?[]:dtTypes.map(t=>({label:t==='Machine'?'Machine':'Delays',data:mD.data.map(rs=>rs&&sum(rs.filter(r=>typeOf(r.Category)===t),'Hours'))})),fmt:F.n0,empty:prodFilter?'Downtime is recorded for the whole line. Clear the product family and category filters to see it.':EMPTY}),
      chart('Top downtime causes',{kind:'hbar',hint:'Hours, top 8 categories',labels:prodFilter?[]:dCat.labels,sets:[{label:'Hours',data:prodFilter?[]:dCat.data,color:PAL[4]}],fmt:F.n1,
        empty:prodFilter?'Downtime is recorded for the whole line. Clear the product family and category filters to see it.':EMPTY}),
      chart('Cases bottled by product family',{kind:'hbar',size:'lg',hint:'Top 10, the rest grouped as Other',labels:fam.labels,sets:[{label:'Cases',data:fam.data,color:PAL[1]}],fmt:F.n0,empty:EMPTY}),
      chart('Line efficiency by product family',{kind:'hbar',size:'lg',hint:'Weighted by cases bottled · top 12 by efficiency',labels:effF.labels,sets:[{label:'Line efficiency %',data:effF.data,color:PAL[2]}],fmt:F.p1,empty:EMPTY}),
      table('Month by month',{span:12,hint:'Rejects are per 1,000 cases',empty:EMPTY,
        cols:[{h:'Month',k:'m',l:1},{h:'Cases bottled',k:'cases',fmt:F.n0},{h:'Plan attainment',k:'att',fmt:F.p1},{h:'Line efficiency',k:'eff',fmt:F.p1},{h:'Cases per hour',k:'cph',fmt:F.n0},
          {h:'Packaging loss',k:'loss',fmt:F.p2},{h:'Rejects',k:'rej',fmt:F.n1},{h:'Downtime (h)',k:'dt',fmt:F.n1}],rows:mrows,...(mrows.length>1?{total}:{})}),
      text('Key insights',ins,{span:12}),
    ];
  }});
