/* Optional comparison view; all series use the same age/sex and period length. */
(function(root){
  'use strict';
  const colors=['#2862f5','#d17616','#8552c7'],dashes=['','7 4','2 4'];
  const names=['기준기간','1년 전','2년 전'];
  const fmt=new Intl.NumberFormat('ko-KR');
  const show=n=>Number.isSafeInteger(n)?fmt.format(n):'—';
  const month=m=>m.slice(0,4)+'년 '+Number(m.slice(4))+'월';
  const range=months=>month(months[0])+(months.length>1?' ~ '+month(months.at(-1)):'');
  const status=m=>m.unavailable?'지원 범위 이전':m.error?'조회 오류':m.a===null||m.b===null?'자료 일부 없음':'정상';
  function reports(periods,age,sex){return periods.map(period=>({...period,report:root.MigrationData.periodReport(period.slots,period.months.length,age,sex)}));}
  function appendRow(target,values){const tr=document.createElement('tr');values.forEach((value,i)=>{const cell=document.createElement(i?'td':'th');if(!i)cell.scope='row';cell.textContent=value;tr.append(cell);});target.append(tr);return tr;}
  function render(host,periods,age,sex){
    if(periods.length<2){host.hidden=true;return;}
    host.hidden=false;
    const series=reports(periods,age,sex),summary=host.querySelector('[data-comparison-summary]');summary.replaceChildren();
    series.forEach(s=>appendRow(summary,[names[s.offset]+' · '+range(s.months),show(s.report.a),show(s.report.b),show(s.report.net),`${s.report.countA}/${s.months.length}개월 전입 · ${s.report.countB}/${s.months.length}개월 전출`]));
    const legend=host.querySelector('[data-comparison-legend]');legend.replaceChildren();
    series.forEach(s=>{const item=document.createElement('span'),swatch=document.createElement('i');swatch.style.borderColor=colors[s.offset];if(s.offset)swatch.style.borderTopStyle=s.offset===1?'dashed':'dotted';swatch.setAttribute('aria-hidden','true');item.append(swatch,document.createTextNode(names[s.offset]+' · '+range(s.months)));legend.append(item);});
    const metricSelect=host.querySelector('#comparison-metric');
    function draw(){
      const key=metricSelect.value,metricName=metricSelect.selectedOptions[0].text;
      const head=host.querySelector('[data-comparison-head]');head.replaceChildren();
      const row=document.createElement('tr');for(const label of ['기준연월',...series.map(s=>names[s.offset]+' '+metricName)]){const th=document.createElement('th');th.scope='col';th.textContent=label;row.append(th);}head.append(row);
      const body=host.querySelector('[data-comparison-months]');body.replaceChildren();
      series[0].months.forEach((m,i)=>{const tr=appendRow(body,[month(m),...series.map(s=>show(s.report.months[i][key]))]);series.forEach((s,index)=>tr.children[index+1].setAttribute('title',month(s.months[i])+' · '+status(s.report.months[i])));});
      const ns='http://www.w3.org/2000/svg',labels=series[0].months,width=Math.max(900,labels.length*70+130);
      const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${width} 260`);svg.style.minWidth=width+'px';svg.setAttribute('role','img');
      const title=document.createElementNS(ns,'title');title.textContent=series.length+'개년 동일기간 '+metricName+' 비교';svg.append(title);
      const values=series.flatMap(s=>s.report.months.map(m=>m[key])).filter(Number.isSafeInteger),low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
      const x=i=>65+(labels.length===1?0:i*(width-130)/(labels.length-1)),y=n=>215-(n-low)/span*175;
      function node(tag,attrs,text){const el=document.createElementNS(ns,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text!==undefined)el.textContent=text;svg.append(el);return el;}
      node('line',{x1:55,y1:y(0),x2:width-45,y2:y(0),stroke:'#d4deed'});
      node('text',{x:4,y:y(high)+4,fill:'#697482','font-size':12},show(high));if(low!==high)node('text',{x:4,y:y(low)+4,fill:'#697482','font-size':12},show(low));
      labels.forEach((m,i)=>node('text',{x:x(i)-18,y:245,fill:'#697482','font-size':12},m.slice(2,4)+'.'+m.slice(4)));
      series.forEach(s=>{
        let previous=null;
        s.report.months.forEach((m,i)=>{
          const n=m[key];if(!Number.isSafeInteger(n)){previous=null;return;}
          if(previous)node('line',{x1:x(previous.i),y1:y(previous.n),x2:x(i),y2:y(n),stroke:colors[s.offset],'stroke-width':2,'stroke-dasharray':dashes[s.offset]});
          const point=node('circle',{cx:x(i),cy:y(n),r:4,fill:colors[s.offset]}),tooltip=document.createElementNS(ns,'title');tooltip.textContent=month(s.months[i])+' · '+metricName+' '+show(n)+'명';point.append(tooltip);previous={i,n};
        });
      });
      host.querySelector('[data-comparison-chart]').replaceChildren(svg);
    }
    metricSelect.onchange=draw;draw();
  }
  function csvRows(periods,age,sex,ageLabel=age,sexLabel=sex){
    const series=reports(periods,age,sex);
    return [[],['동일기간 비교'],['비교 구분','집계기간','연령','성별','전입','전출','순이동','전입 확인개월','전출 확인개월'],
      ...series.map(s=>[names[s.offset],s.months[0]+'~'+s.months.at(-1),ageLabel,sexLabel,s.report.a,s.report.b,s.report.net,s.report.countA,s.report.countB]),
      [],['비교 구분','연월','연령','성별','전입','전출','순이동','자료 상태'],
      ...series.flatMap(s=>s.months.map((m,i)=>[names[s.offset],m,ageLabel,sexLabel,s.report.months[i].a,s.report.months[i].b,s.report.months[i].net,status(s.report.months[i])]))];
  }
  root.ComparisonUI={render,csvRows};
})(window);
