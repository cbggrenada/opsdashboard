
const LOSS_COST_PER_HL=50; // US$ per hl, as in the Power BI measure "Loss Cost USD"
function bandOf(pct){const b=(T.Dim_LossBand||[]).find(x=>pct>=x['Min Loss %']&&pct<x['Max Loss %']);return b?b.Band:null}
page({sec:'sc',id:'packaging-loss',title:'Packaging loss',tab:'Packaging loss',tables:['Fact_Packaging','Dim_LossBand'],
  slicers:[yearSlicer(['Fact_Packaging'],{def:()=>{const ys=uniq((T.Fact_Packaging||[]).map(r=>r._y)).sort();return ys.slice(-2)}}),monthSlicer(['Fact_Packaging']),fieldSlicer('cat','Category','Fact_Packaging','Category')],
  build(c){
    const R=c.rows('Fact_Packaging');
    const bbt=sum(R,'BBT HLs'),btl=sum(R,'Bottled HLs'),loss=sum(R,'Loss HLs');const rate=div(loss,bbt);
    const m=byMonth(R,rs=>({l:sum(rs,'Loss HLs'),p:div(sum(rs,'Loss HLs'),sum(rs,'BBT HLs'))}));
    const cat=byCat(R,'Category',rs=>sum(rs,'Loss HLs'));
    const fam=byCat(R,'Product Family',rs=>sum(rs,'Loss HLs'));
    const frows=fam.items.map(x=>{const b=sum(x.rs,'BBT HLs'),p=div(x.v,b);return {k:x.k,bbt:b,loss:x.v,pct:p==null?null:p*100,runs:x.rs.length,cases:sum(x.rs,'Cases'),band:p==null?null:bandOf(p*100)}});
    const bands=(T.Dim_LossBand||[]).filter(b=>b['Max Loss %']<50);
    const odd=frows.filter(r=>r.pct!=null&&r.pct<0);
    const notes=odd.length?[`Check the source workbook: ${odd.map(r=>`${r.k} shows ${fmtN(r.pct,2)}%`).join(', ')}. A negative loss means bottled volume is above BBT volume, usually a data entry error.`]:[];
    return [
      row([card('BBT volume',bbt,{fmt:F.n0,unit:'hl',foot:'Beer sent to the line'}),card('Bottled volume',btl,{fmt:F.n0,unit:'hl',foot:'Packed'}),
        card('Loss volume',loss,{fmt:F.n1,unit:'hl',foot:'BBT minus bottled'}),
        card('Loss rate',rate==null?null:rate*100,{fmt:F.p2,foot:'Loss ÷ BBT volume',st:rate==null?'':rate*100<1.5?'good':rate*100<3?'warn':'bad',sub:rate==null?'':bandOf(rate*100)||''}),
        card('Cost of loss',loss==null?null:loss*LOSS_COST_PER_HL,{fmt:F.usd,foot:`At US$${LOSS_COST_PER_HL} per hl`})]),
      chart('Packaging loss by month',{span:7,kind:'bar',hint:'Bars: loss hl · line: loss % of BBT',labels:m.labels,sets:[{label:'Loss hl',data:m.data.map(x=>x&&x.l),color:PAL[2]},{label:'Loss %',data:m.data.map(x=>x&&x.p!=null?x.p*100:null),type:'line',axis:'y2',color:PAL[0],vl:true}],
        refs:bands.map((b,i)=>({v:b['Max Loss %'],label:i?`Problem above ${b['Max Loss %']}%`:`${b.Band} up to ${b['Max Loss %']}%`,axis:'y2',color:i?'#C0392B':'#1E8449'})),fmt:F.n0,fmt2:F.p1}),
      chart('Loss share by category',{span:5,kind:'donut',labels:cat.labels,sets:[{data:cat.data}],fmt:v=>fmtN(v,1)+' hl'}),
      chart('Loss by product family',{span:12,kind:'bar',hint:'Bars: loss hl · line: loss %',labels:frows.map(r=>r.k),sets:[{label:'Loss hl',data:frows.map(r=>r.loss),color:PAL[2]},{label:'Loss %',data:frows.map(r=>r.pct),type:'line',axis:'y2',color:PAL[0],points:true}],fmt:F.n0,fmt2:F.p1,vl:false,notes}),
      table('Top contributors by liquid loss',{span:12,maxH:420,cols:[{h:'Product family',k:'k',l:1},{h:'BBT hl',k:'bbt',fmt:F.n1},{h:'Loss hl',k:'loss',fmt:F.n2},{h:'Loss %',k:'pct',fmt:F.p2},{h:'Runs',k:'runs',fmt:F.n0},{h:'Cases',k:'cases',fmt:F.n0},
        {h:'Band',k:'band',l:1,html:1,fmt:v=>v?`<span class="pill ${v==='Best-in-class'?'g':v==='Typical'?'a':'b'}">${esc(v)}</span>`:'–'}],rows:frows,
        total:{k:'Total',bbt,loss,pct:rate==null?null:rate*100,runs:R.length,cases:sum(R,'Cases'),band:null}}),
    ];
  }});

page({sec:'sc',id:'shift-packaging',title:'Packaging by shift',tab:'Packaging by shift',tables:['ShiftLog'],
  slicers:[monthSlicer(['ShiftLog'],{def:()=>{const ks=uniq((T.ShiftLog||[]).map(ymKey).filter(Boolean)).sort();return ks.slice(-1)}}),fieldSlicer('shift','Shift','ShiftLog','Shift'),fieldSlicer('prod','Product','ShiftLog','Product'),fieldSlicer('sup','Supervisor','ShiftLog','Supervisor')],
  build(c){
    const R=c.rows('ShiftLog');const days=uniq(R.map(r=>r.Date).filter(Boolean)).length;
    const cases=sum(R,'Cases');
    const prod=byCat(R,'Product',rs=>sum(rs,'Cases'));
    const cph=byCat(R,'Product',rs=>avg(rs.filter(r=>r.CPH>0),'CPH'));
    const eff=byCat(R,'Product',rs=>avg(rs.filter(r=>r.Efficiency>0),'Efficiency'));
    const ch=byCat(R,'Product',rs=>sum(rs,'Changeover'));
    const shifts=byCat(R,'Shift',rs=>sum(rs,'Cases'));
    return [
      row([card('Total cases',cases,{foot:'Cases bottled'}),card('Cases per day',div(cases,days),{foot:`Over ${days} production days`}),
        card('Average cases per hour',avg(R.filter(r=>r.CPH>0),'CPH'),{fmt:F.n1,foot:'Shifts that ran'}),card('Average line efficiency',avg(R.filter(r=>r.Efficiency>0),'Efficiency'),{fmt:F.p1,foot:'Against rated speed'}),
        card('Changeover time',sum(R,'Changeover'),{unit:'min',foot:`Expected ${fmtN(sum(R,'ExpChangeover'))} min`,st:status(sum(R,'Changeover'),sum(R,'ExpChangeover'),false)}),
        card('Downtime',sum(R,'Downtime'),{unit:'min',foot:`${fmtN(div(sum(R,'Downtime'),60),1)} hours`})]),
      chart('Average cases per hour by product',{kind:'bar',labels:cph.labels,sets:[{label:'Cases per hour',data:cph.data}],fmt:F.n0}),
      chart('Average line efficiency by product',{kind:'hbar',labels:eff.labels,sets:[{label:'Line efficiency %',data:eff.data,color:PAL[2]}],fmt:F.p1}),
      chart('Changeover time: actual vs expected',{kind:'hbar',hint:'Minutes by product',labels:ch.labels,sets:[{label:'Actual',data:ch.data,color:PAL[1]},{label:'Expected',data:ch.labels.map(k=>sum(R.filter(r=>r.Product===k),'ExpChangeover')),color:PAL[5]}],fmt:F.n0}),
      table('Cases per day by product',{cols:[{h:'Product',k:'k',l:1},{h:'Cases',k:'v',fmt:F.n0},{h:'Days ran',f:r=>uniq(r.rs.map(x=>x.Date).filter(Boolean)).length,fmt:F.n0},{h:'Cases per day',f:r=>div(r.v,uniq(r.rs.map(x=>x.Date).filter(Boolean)).length),fmt:F.n0}],rows:prod.items,maxH:320}),
      chart('Total cases by product',{span:8,kind:'bar',labels:prod.labels,sets:[{label:'Cases',data:prod.data,colors:prod.labels.map((_,i)=>PAL[i%PAL.length])}],fmt:F.n0}),
      chart('Cases by shift',{span:4,kind:'donut',labels:shifts.labels,sets:[{data:shifts.data}],fmt:F.n0,legendPos:'bottom'}),
    ];
  }});

page({sec:'sc',id:'pkg-loss-3yr',title:'Packaging loss 3-year comparison',tab:'3-year packaging loss',tables:['Pkg_Loss_3Yr'],
  slicers:[yearSlicer(['Pkg_Loss_3Yr']),fieldSlicer('month','Month','Pkg_Loss_3Yr',r=>MONTHS[r._m-1],{order:v=>v.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b))})],
  build(c){
    const R=c.rows('Pkg_Loss_3Yr');const yrs=uniq(R.map(r=>r._y)).sort();const ly=yrs[yrs.length-1];
    const months=uniq(R.map(r=>r._m)).sort((a,b)=>a-b);
    const cards=yrs.slice(-3).map(y=>{const rs=R.filter(r=>r._y===y);return card(`${y} average loss`,avg(rs,'Loss %'),{fmt:F.p2,foot:`Average of ${rs.filter(r=>isNum(r['Loss %'])).length} monthly figures`})});
    const lyR=R.filter(r=>r._y===ly);
    cards.push(card(`${ly||''} cost of loss`,sum(lyR,'Est Loss Value USD'),{fmt:F.usd,foot:'Estimated value, selected months'}));
    const ins=[];
    yrs.forEach(y=>{const rs=R.filter(r=>r._y===y&&isNum(r['Loss %']));if(!rs.length)return;const hi=rs.reduce((a,b)=>b['Loss %']>a['Loss %']?b:a),lo=rs.reduce((a,b)=>b['Loss %']<a['Loss %']?b:a);
      ins.push(`${y}: average ${fmtN(avg(rs,'Loss %'),2)}%, highest in ${MONTHS[hi._m-1]} (${fmtN(hi['Loss %'],2)}%), lowest in ${MONTHS[lo._m-1]} (${fmtN(lo['Loss %'],2)}%).`)});
    if(yrs.length>1){const p=yrs[yrs.length-2];const lm=uniq(lyR.map(r=>r._m));const a=avg(lyR,'Loss %'),b=avg(R.filter(r=>r._y===p&&lm.includes(r._m)),'Loss %');
      if(a!=null&&b!=null)ins.push(`Same months compared: ${ly} averages ${fmtN(a,2)}% against ${fmtN(b,2)}% in ${p} (${sgn(a-b)} points).`)}
    return [row(cards),
      chart('Monthly packaging loss % by year',{span:12,kind:'line',labels:months.map(m=>MONTHS[m-1]),sets:yrs.map(y=>({label:String(y),data:months.map(m=>{const r=R.find(x=>x._y===y&&x._m===m);return r?r['Loss %']:null}),vl:yrs.length===1})),fmt:F.p2,zero:false}),
      chart(`Cost of packaging loss ${ly||''}`,{span:6,kind:'bar',hint:'Estimated value in US$',labels:lyR.map(r=>MONTHS[r._m-1]),sets:[{label:'US$',data:lyR.map(r=>r['Est Loss Value USD']),color:PAL[4]}],fmt:F.big}),
      text('Key insights',ins,{span:6}),
    ];
  }});

page({sec:'sc',id:'daily-bottling',title:'Daily bottling',tab:'Daily bottling',tables:['Fact_Bottling'],
  slicers:[monthSlicer(['Fact_Bottling']),fieldSlicer('cat','Category','Fact_Bottling','Category'),fieldSlicer('fam','Product family','Fact_Bottling','Product Family')],
  build(c){
    const R=c.rows('Fact_Bottling');
    const planned=R.filter(r=>isNum(r['Cases Planned']));
    // as in Power BI: all cases bottled ÷ all cases planned (some runs carry on from an earlier plan and have no planned figure)
    const att=div(sum(R,'Cases Bottled'),sum(R,'Cases Planned'));const attP=div(sum(planned,'Cases Bottled'),sum(planned,'Cases Planned'));
    const rej=div(sum(R,'Rejects'),sum(R,'Cases Bottled'));
    const rejF=byCat(R.filter(r=>(r['Cases Bottled']||0)>0),'Product Family',rs=>{const v=div(sum(rs,'Rejects'),sum(rs,'Cases Bottled'));return v==null?null:v*1000});
    const cphF=byCat(R,'Product Family',rs=>avg(rs,'Cases Per Hour'));
    const daily=[...group(R,r=>r.Date).entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    const mon=byMonth(R,rs=>rs);
    const ins=[];
    if(daily.length){const best=daily.reduce((a,b)=>sum(b[1],'Cases Bottled')>sum(a[1],'Cases Bottled')?b:a);ins.push(`Best day: ${new Date(best[0]+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})} with ${fmtN(sum(best[1],'Cases Bottled'))} cases.`)}
    if(cphF.items.length)ins.push(`Fastest product family: ${cphF.items[0].k} at ${fmtN(cphF.items[0].v,0)} cases per hour; slowest: ${cphF.items[cphF.items.length-1].k} at ${fmtN(cphF.items[cphF.items.length-1].v,0)}.`);
    if(rejF.items.length)ins.push(`Highest reject rate: ${rejF.items[0].k} at ${fmtN(rejF.items[0].v,1)} per 1,000 cases.`);
    if(att!=null)ins.push(`Plan attainment is ${fmtN(att*100,1)}% overall. Counting only runs that have a planned figure it is ${fmtN(attP*100,1)}% (${fmtN(sum(planned,'Cases Bottled'))} of ${fmtN(sum(planned,'Cases Planned'))} cases); ${fmtN(R.length-planned.length)} runs have no plan recorded.`);
    return [
      row([card('Plan attainment',att==null?null:att*100,{fmt:F.p1,foot:'All cases bottled ÷ cases planned',st:att==null?'':att>=1?'good':'bad',sub:attP==null?'':`${fmtN(attP*100,1)}% counting only runs with a plan`}),
        card('Cases bottled',sum(R,'Cases Bottled'),{foot:`${daily.length} production days`}),
        card('Bottled volume',sum(R,'Bottled HLs'),{fmt:F.n0,unit:'hl'}),
        card('Rejects per 1,000 cases',rej==null?null:rej*1000,{fmt:F.n1,foot:`${fmtN(sum(R,'Rejects'))} rejects`})]),
      chart('Reject rate per 1,000 cases by product family',{kind:'hbar',size:'lg',labels:rejF.labels,sets:[{label:'Per 1,000 cases',data:rejF.data,color:PAL[4]}],fmt:F.n1}),
      chart('Cases bottled per day',{kind:'line',size:'lg',labels:daily.map(d=>{const x=new Date(d[0]+'T00:00');return x.getDate()+' '+MONTHS[x.getMonth()]}),sets:[{label:'Cases',data:daily.map(d=>sum(d[1],'Cases Bottled')),fill:false}],fmt:F.n0}),
      chart('Average cases per hour by product family',{kind:'hbar',size:'lg',labels:cphF.labels,sets:[{label:'Cases per hour',data:cphF.data,color:PAL[2]}],fmt:F.n0}),
      chart('Planned vs bottled by month',{kind:'bar',size:'lg',hint:'Planned shown for runs with a plan',labels:mon.labels,sets:[{label:'Planned',data:mon.data.map(rs=>rs&&sum(rs,'Cases Planned')),color:PAL[5]},{label:'Bottled',data:mon.data.map(rs=>rs&&sum(rs,'Cases Bottled'))}],fmt:F.big}),
      text('Key insights',ins,{span:12}),
    ];
  }});

page({sec:'sc',id:'cost-performance',title:'Cost vs performance',tab:'Cost vs performance',tables:['Cost_Ops_Comparison'],
  slicers:[monthSlicer(['Cost_Ops_Comparison'])],
  build(c){
    const R=[...c.rows('Cost_Ops_Comparison')].sort((a,b)=>(a._y-b._y)||(a._m-b._m));const labs=R.map(r=>ymLabel(ymKey(r),oneYear(R.map(ymKey))));
    const col=k=>R.map(r=>r[k]);
    const ins=[];
    if(R.length){const hi=R.reduce((a,b)=>b['Total Ops Cost']>a['Total Ops Cost']?b:a),dt=R.reduce((a,b)=>b['Downtime Hours']>a['Downtime Hours']?b:a);
      ins.push(`Highest operating cost: ${MONTHS[hi._m-1]} (${F.ec(hi['Total Ops Cost'])}). Most downtime: ${MONTHS[dt._m-1]} (${fmtN(dt['Downtime Hours'],1)} h).`);
      ins.push(`Maintenance and spares were ${fmtN(sum(R,'Maintenance & Spares Cost')/sum(R,'Total Ops Cost')*100,1)}% of operating cost; energy ${fmtN(sum(R,'Energy Cost')/sum(R,'Total Ops Cost')*100,1)}%.`);
      ins.push(`Operating cost averaged ${F.ec(sum(R,'Total Ops Cost')/R.length)} a month and downtime ${fmtN(sum(R,'Downtime Hours')/R.length,1)} h a month.`)}
    return [
      row([card('Total operating cost',sum(R,'Total Ops Cost'),{fmt:F.ec,foot:`${R.length} month${R.length===1?'':'s'}`}),card('Downtime',sum(R,'Downtime Hours'),{fmt:F.n1,unit:'h',foot:'Hours, same months'}),
        card('Maintenance and spares',sum(R,'Maintenance & Spares Cost'),{fmt:F.ec,foot:R.length?`${fmtN(sum(R,'Maintenance & Spares Cost')/sum(R,'Total Ops Cost')*100,1)}% of operating cost`:''}),card('Packaging loss',avg(R,'Packaging Loss %'),{fmt:F.p2,foot:'Average of monthly %'})]),
      chart('Total operating cost vs downtime',{span:12,kind:'bar',labels:labs,sets:[{label:'Operating cost (EC$)',data:col('Total Ops Cost')},{label:'Downtime hours',data:col('Downtime Hours'),type:'line',axis:'y2',color:PAL[1]}],fmt:F.big,fmt2:F.n0}),
      chart('Maintenance and spares cost vs downtime',{kind:'bar',labels:labs,sets:[{label:'Maintenance & spares (EC$)',data:col('Maintenance & Spares Cost'),color:PAL[2]},{label:'Downtime hours',data:col('Downtime Hours'),type:'line',axis:'y2',color:PAL[1]}],fmt:F.big,fmt2:F.n0}),
      chart('Packaging material cost vs packaging loss',{kind:'bar',labels:labs,sets:[{label:'Packaging material (EC$)',data:col('Packaging Material Cost'),color:PAL[3]},{label:'Packaging loss %',data:col('Packaging Loss %'),type:'line',axis:'y2',color:PAL[4]}],fmt:F.big,fmt2:F.p1,zero:false}),
      table('Cost breakdown by month',{span:12,cols:[{h:'Month',f:r=>ymLabel(ymKey(r)),l:1},{h:'Operating cost',k:'Total Ops Cost',fmt:F.ec},{h:'Maint. & spares',k:'Maintenance & Spares Cost',fmt:F.ec},{h:'Energy',k:'Energy Cost',fmt:F.ec},
        {h:'Packaging material',k:'Packaging Material Cost',fmt:F.ec},{h:'Loss & quality',k:'Loss & Quality Cost',fmt:F.ec},{h:'Downtime h',k:'Downtime Hours',fmt:F.n1},{h:'Pkg loss hl',k:'Packaging Loss HL',fmt:F.n1},{h:'Pkg loss %',k:'Packaging Loss %',fmt:F.p2}],rows:R}),
      text('Key insights',ins,{span:12}),
    ];
  }});

const PK_ORDER=['Production Cases','OEE','Plant Availability','FTR','Maintenance Compliance','Extract Recovery','Brews Per Day','Total Bottling Loss','Process Loss Vol.','Water','Fuel','Electricity','CO2'];
page({sec:'sc',id:'production-kpis',title:'Production KPIs',tab:'Production KPIs',tables:['Production_KPIs'],
  slicers:[segSlicer('period','Period',['MTD','YTD'],'MTD')],
  build(c){
    const per=c.one('period');const R=c.all('Production_KPIs').filter(r=>String(r.Period).toUpperCase()===per);
    const kpis=uniq([...PK_ORDER.filter(k=>R.some(r=>r.KPI===k)),...R.map(r=>r.KPI)]);
    const tile=k=>{const r=R.find(x=>x.KPI===k);if(!r)return card(k,null);const up=String(r['Better Direction']).toLowerCase()!=='lower';
      const pct=r.Unit==='%';const f=pct?F.p1:r.Unit==='cases'?F.n0:F.n1;
      return card(k,r.Actual,{fmt:f,unit:pct?'':r.Unit,st:status(r.Actual,r.Budget,up)||'',sub:vsLine([r.Budget!=null?`Budget ${f(r.Budget)}`:'',r['Last Year']!=null?`Last year ${f(r['Last Year'])}`:'']),foot:up?'Higher is better':'Lower is better'})};
    const out=['Production Cases','OEE','Plant Availability','FTR','Maintenance Compliance','Extract Recovery','Brews Per Day'].filter(k=>kpis.includes(k));
    const rest=kpis.filter(k=>!out.includes(k));
    const pc=R.find(r=>r.KPI==='Production Cases');
    return [sec('Output and efficiency'),row(out.map(tile)),sec('Loss and utilities intensity'),row(rest.map(tile)),
      chart(`Production cases ${per}: actual vs budget vs last year`,{span:5,kind:'bar',labels:['Actual','Budget','Last year'],sets:[{label:'Cases',data:pc?[pc.Actual,pc.Budget,pc['Last Year']]:[],colors:[PAL[0],PAL[5],PAL[2]]}],fmt:F.n0,legend:false}),
      table(`All KPIs, ${per}`,{span:7,maxH:640,cols:[{h:'KPI',k:'KPI',l:1},{h:'Unit',k:'Unit',l:1},{h:'Actual',k:'Actual',fmt:(v,r)=>r.Unit==='cases'?F.n0(v):F.n1(v)},{h:'Budget',k:'Budget',fmt:(v,r)=>r.Unit==='cases'?F.n0(v):F.n1(v)},{h:'Last year',k:'Last Year',fmt:(v,r)=>r.Unit==='cases'?F.n0(v):F.n1(v)},
        {h:'Status',l:1,html:1,f:r=>status(r.Actual,r.Budget,String(r['Better Direction']).toLowerCase()!=='lower'),fmt:v=>v?`<span class="pill ${v==='good'?'g':'b'}">${v==='good'?'On target':'Off target'}</span>`:'–'}],
        rows:kpis.map(k=>R.find(r=>r.KPI===k))}),
    ];
  }});

page({sec:'sc',id:'brew-loss-3yr',title:'Brewing loss 3-year comparison',tab:'3-year brewing loss',tables:['Brew_Loss_3Yr'],
  slicers:[yearSlicer(['Brew_Loss_3Yr']),fieldSlicer('month','Month','Brew_Loss_3Yr',r=>MONTHS[r._m-1],{order:v=>v.sort((a,b)=>MONTHS.indexOf(a)-MONTHS.indexOf(b))})],
  build(c){
    const R=c.rows('Brew_Loss_3Yr');const yrs=uniq(R.map(r=>r._y)).sort();const months=uniq(R.map(r=>r._m)).sort((a,b)=>a-b);
    const cards=yrs.slice(-3).map(y=>{const rs=R.filter(r=>r._y===y);return card(`${y} average loss`,avg(rs,'Loss %'),{fmt:F.p2,foot:`Average of ${rs.filter(r=>isNum(r['Loss %'])).length} months`,sub:`Weighted: ${fmtN(div(sum(rs,r=>r['FV HLs']-r['BBT HLs']),sum(rs,'FV HLs'))*100,2)}% of FV volume`})});
    const ly=yrs[yrs.length-1];cards.push(card(`${ly||''} value of loss`,sum(R.filter(r=>r._y===ly),'Est Loss Value USD'),{fmt:F.usd,foot:'Estimated, selected months'}));
    const hm=months.map(m=>{const o={m:MONTHS[m-1]};yrs.forEach(y=>{const r=R.find(x=>x._y===y&&x._m===m);o[y]=r?r['Loss %']:null});return o});
    const ins=[];
    yrs.forEach(y=>{const rs=R.filter(r=>r._y===y&&isNum(r['Loss %']));if(!rs.length)return;const hi=rs.reduce((a,b)=>b['Loss %']>a['Loss %']?b:a);ins.push(`${y}: average ${fmtN(avg(rs,'Loss %'),2)}%, peak in ${MONTHS[hi._m-1]} (${fmtN(hi['Loss %'],2)}%).`)});
    if(yrs.length>1){const p=yrs[yrs.length-2],lm=uniq(R.filter(r=>r._y===ly).map(r=>r._m));const a=avg(R.filter(r=>r._y===ly),'Loss %'),b=avg(R.filter(r=>r._y===p&&lm.includes(r._m)),'Loss %');
      if(a!=null&&b!=null)ins.push(`Same months compared: ${ly} averages ${fmtN(a,2)}% against ${fmtN(b,2)}% in ${p} (${sgn(a-b)} points).`)}
    return [row(cards),
      chart('Brewing process loss % by month and year',{span:12,kind:'line',labels:months.map(m=>MONTHS[m-1]),sets:yrs.map(y=>({label:String(y),data:months.map(m=>{const r=R.find(x=>x._y===y&&x._m===m);return r?r['Loss %']:null})})),fmt:F.p2,zero:false}),
      chart('Annual average loss %',{span:6,kind:'bar',labels:yrs.map(String),sets:[{label:'Average loss %',data:yrs.map(y=>avg(R.filter(r=>r._y===y),'Loss %'))}],fmt:F.p2}),
      text('Key insights',ins,{span:6}),
      table('Loss % heat map, month by year',{span:12,heat:1,maxH:900,lowGood:1,hint:'Green is lower loss, red is higher',cols:[{h:'Month',k:'m',l:1},...yrs.map(y=>({h:String(y),k:y,fmt:F.p2,heat:1}))],rows:hm,
        total:Object.assign({m:'Average'},...yrs.map(y=>({[y]:avg(R.filter(r=>r._y===y),'Loss %')})))}),
    ];
  }});
