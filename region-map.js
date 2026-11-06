/* Choropleth maps use the same period totals as the table. No external map service. */
(function(root){
  'use strict';
  const missing='#d9dfe3', excluded='#edf1f5';
  const palettes={a:[[255,245,240],[153,0,13]],b:[[239,246,255],[8,48,107]]};
  const valid=n=>Number.isSafeInteger(n) && n>=0;
  function maximum(rows){return Math.max(0,...rows.flatMap(r=>[r.a,r.b]).filter(valid));}
  function color(value,max,direction){
    if(!valid(value))return missing;
    const t=max>0?Math.min(1,value/max):0,[start,end]=palettes[direction];
    return '#'+start.map((n,i)=>Math.round(n+(end[i]-n)*t).toString(16).padStart(2,'0')).join('');
  }
  let selected=null;
  function render(host,rows,label){
    const data=root.JejuMapRegions;
    if(!data?.regions?.length){host.hidden=true;return;}
    const ns='http://www.w3.org/2000/svg',fmt=new Intl.NumberFormat('ko-KR');
    const rowByCode=new Map(rows.map(r=>[r.code,r]));
    const max=maximum(rows),known=rows.some(r=>valid(r.a)||valid(r.b));
    const totals=root.MigrationData.totals(rows);
    const views=[];
    host.hidden=false;host.querySelector('.map-period').textContent=label;
    const node=(tag,attrs={},text)=>{const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);if(text!==undefined)el.textContent=text;return el;};
    function describe(code,flow){
      if(code==='50')return '제주 · 내부 이동 제외';
      const region=data.regions.find(r=>r.code===code),row=rowByCode.get(code),value=row?.[flow];
      const name=row?.name || region.name;
      const count=valid(value)?fmt.format(value)+'명':'자료 없음';
      return flow==='a'?`${name} → 제주 · ${count}`:`제주 → ${name} · ${count}`;
    }
    function choose(code){
      selected=code || null;
      for(const view of views){
        view.select.value=selected || '';
        view.info.textContent=selected?describe(selected,view.flow):'지역을 선택하면 인원을 확인할 수 있습니다.';
        view.groups.forEach((group,key)=>{group.classList.toggle('is-selected',key===selected);group.setAttribute('aria-pressed',String(key===selected));});
      }
    }
    for(const flow of ['a','b']){
      const card=host.querySelector(`[data-map-flow="${flow}"]`),select=card.querySelector('select'),info=card.querySelector('.map-readout');
      const total=totals[flow],count=flow==='a'?totals.countA:totals.countB;
      card.querySelector('.map-total-value').textContent=valid(total)?fmt.format(total)+'명':'—';
      card.querySelector('.map-total-note').textContent=totals.count
        ?`확인 ${count}/${totals.count}개 지역${total===null?' · 일부 자료 없음':''}`:'자료 없음';
      select.replaceChildren();
      const first=document.createElement('option');first.value='';first.textContent='지역 선택';select.append(first);
      data.regions.forEach(region=>{const option=document.createElement('option');option.value=region.code;option.textContent=region.shortName;select.append(option);});
      const svg=node('svg',{viewBox:data.viewBox,role:'group','aria-label':flow==='a'?'시도별 제주 전입 지도':'시도별 제주 전출 지도'});
      svg.append(node('title',{},flow==='a'?'빨강이 진할수록 제주 전입 인원이 많습니다.':'파랑이 진할수록 제주 전출 인원이 많습니다.'));
      const groups=new Map();
      // Large regions first; metropolitan paths and callout labels remain clickable above them.
      const small=new Set(['11','26','27','28','30','31','36']);
      const ordered=[...data.regions].sort((a,b)=>Number(small.has(a.code))-Number(small.has(b.code)));
      const labels=[];
      for(const region of ordered){
        const value=rowByCode.get(region.code)?.[flow],group=node('g',{'data-region':region.code,'class':'map-region',role:'button',tabindex:'0','aria-label':describe(region.code,flow),'aria-pressed':'false'});
        group.append(node('title',{},describe(region.code,flow)));
        group.append(node('path',{d:region.d,fill:region.code==='50'?excluded:color(value,max,flow),'fill-rule':'evenodd'}));
        const [x,y]=region.anchor,[lx,ly]=region.label;
        if(x!==lx || y!==ly)group.append(node('path',{d:`M${x},${y}L${lx},${ly}`,'class':'map-leader',fill:'none'}));
        const labelNode=node('text',{x:lx,y:ly,'class':'map-label','text-anchor':'middle','dominant-baseline':'middle'},region.shortName);
        // Put labels in a final layer but retain keyboard and pointer behavior.
        labelNode.addEventListener('pointerenter',()=>choose(region.code));
        labelNode.addEventListener('click',()=>choose(region.code));labels.push(labelNode);
        group.addEventListener('pointerenter',()=>choose(region.code));group.addEventListener('focus',()=>choose(region.code));group.addEventListener('click',()=>choose(region.code));
        group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(region.code);}});
        svg.append(group);groups.set(region.code,group);
      }
      labels.forEach(el=>svg.append(el));
      card.querySelector('.map-canvas').replaceChildren(svg);
      const ramp=card.querySelector('.map-ramp');ramp.style.background=known?`linear-gradient(to right,${color(0,max,flow)},${color(max,max,flow)})`:missing;
      card.querySelector('.map-scale-start').textContent=known?'0명':'자료 없음';
      card.querySelector('.map-scale-end').textContent=known?fmt.format(max)+'명':'자료 없음';
      select.onchange=()=>choose(select.value);
      views.push({flow,select,info,groups});
    }
    choose(selected);
  }
  const api={render,color,maximum,missing,excluded};
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  else root.RegionMaps=api;
})(typeof globalThis!=='undefined'?globalThis:this);
