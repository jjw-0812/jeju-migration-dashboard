/* Year/month wheel dialog. Values are committed only by the confirm button. */
(function(root){
  'use strict';
  const rowHeight=44;
  function mount(start,end,latest){
    const dialog=document.getElementById('month-picker'),title=document.getElementById('month-picker-title'),preview=document.getElementById('month-picker-preview');
    const wheels={year:dialog.querySelector('[data-wheel="year"]'),month:dialog.querySelector('[data-wheel="month"]')};
    const inputs={start,end},triggers={start:document.getElementById('start-dial'),end:document.getElementById('end-dial')};
    let active=null,draft={year:2024,month:1},bounds=null,columns={};
    const padded=n=>String(n).padStart(2,'0');
    const valueOf=()=>String(draft.year)+'-'+padded(draft.month);
    const label=value=>Number(value.slice(0,4))+'년 '+Number(value.slice(5))+'월';
    const clamp=(value,min,max)=>value<min?min:value>max?max:value;
    function updateTrigger(id){document.getElementById(id+'-display').textContent=label(inputs[id].value);triggers[id].disabled=inputs[id].disabled;}
    for(const id of ['start','end']){
      updateTrigger(id);
      inputs[id].addEventListener('input',()=>updateTrigger(id));inputs[id].addEventListener('change',()=>updateTrigger(id));
      new MutationObserver(()=>updateTrigger(id)).observe(inputs[id],{attributes:true,attributeFilter:['disabled']});
      triggers[id].addEventListener('click',()=>open(id));
    }
    function range(){
      return active==='start'?{min:start.min || '2024-01',max:end.value || latest}:{min:start.value || '2024-01',max:latest};
    }
    function monthValues(){
      const low=draft.year===Number(bounds.min.slice(0,4))?Number(bounds.min.slice(5)):1;
      const high=draft.year===Number(bounds.max.slice(0,4))?Number(bounds.max.slice(5)):12;
      return Array.from({length:high-low+1},(_,i)=>low+i);
    }
    function mark(kind){
      const wheel=wheels[kind],column=columns[kind],value=draft[kind];
      for(const option of wheel.children){const selected=Number(option.dataset.value)===value;option.setAttribute('aria-selected',String(selected));option.classList.toggle('is-current',selected);}
      wheel.setAttribute('aria-activedescendant',`dial-${kind}-${value}`);
      column.index=column.values.indexOf(value);
      preview.textContent=label(valueOf());
    }
    function choose(kind,index,scroll){
      const column=columns[kind];if(!column)return;
      index=Math.max(0,Math.min(column.values.length-1,index));
      const value=column.values[index],changed=draft[kind]!==value;
      draft[kind]=value;mark(kind);
      if(scroll)wheels[kind].scrollTop=index*rowHeight;
      if(kind==='year' && changed){
        const values=monthValues();draft.month=Math.max(values[0],Math.min(values[values.length-1],draft.month));
        build('month',values);
      }
    }
    function build(kind,values){
      const wheel=wheels[kind];columns[kind]={values,index:values.indexOf(draft[kind])};
      wheel.replaceChildren(...values.map(value=>{
        const option=document.createElement('div');option.id=`dial-${kind}-${value}`;option.className='wheel-option';option.setAttribute('role','option');option.dataset.value=value;option.textContent=value+(kind==='year'?'년':'월');return option;
      }));
      mark(kind);wheel.scrollTop=columns[kind].index*rowHeight;
    }
    function open(id){
      if(inputs[id].disabled)return;
      active=id;bounds=range();
      // Restore a usable range if a programmatic value was invalid.
      if(bounds.min>bounds.max)bounds={min:'2024-01',max:latest};
      const value=clamp(inputs[id].value || latest,bounds.min,bounds.max);
      draft={year:Number(value.slice(0,4)),month:Number(value.slice(5))};
      title.textContent=(id==='start'?'시작연월':'종료연월')+' 선택';
      triggers[id].setAttribute('aria-expanded','true');dialog.showModal();
      const minYear=Number(bounds.min.slice(0,4)),maxYear=Number(bounds.max.slice(0,4));
      build('year',Array.from({length:maxYear-minYear+1},(_,i)=>minYear+i));build('month',monthValues());
      wheels.year.focus({preventScroll:true});
    }
    for(const kind of ['year','month']){
      const wheel=wheels[kind];let drag=null,suppressClick=false;
      wheel.addEventListener('scroll',()=>{
        if(!dialog.open || !columns[kind])return;
        choose(kind,Math.round(wheel.scrollTop/rowHeight),false);
      });
      wheel.addEventListener('keydown',event=>{
        const column=columns[kind];if(!column)return;
        let index=column.index;
        if(event.key==='ArrowDown')index++;
        else if(event.key==='ArrowUp')index--;
        else if(event.key==='Home')index=0;
        else if(event.key==='End')index=column.values.length-1;
        else if(event.key==='PageDown')index+=3;
        else if(event.key==='PageUp')index-=3;
        else return;
        event.preventDefault();choose(kind,index,true);
      });
      wheel.addEventListener('click',event=>{
        if(suppressClick){suppressClick=false;return;}
        const option=event.target.closest('[data-value]');if(option)choose(kind,columns[kind].values.indexOf(Number(option.dataset.value)),true);
      });
      wheel.addEventListener('pointerdown',event=>{
        if(event.pointerType!=='mouse' || event.button!==0)return;
        const option=event.target.closest('[data-value]');
        drag={id:event.pointerId,y:event.clientY,top:wheel.scrollTop,moved:false,value:option?Number(option.dataset.value):null};
        wheel.style.scrollSnapType='none';wheel.setPointerCapture(event.pointerId);wheel.focus({preventScroll:true});event.preventDefault();
      });
      wheel.addEventListener('pointermove',event=>{
        if(!drag || event.pointerId!==drag.id)return;
        const distance=drag.y-event.clientY;if(Math.abs(distance)>4)drag.moved=true;
        wheel.scrollTop=drag.top+distance;
      });
      const finishDrag=event=>{
        if(!drag || event.pointerId!==drag.id)return;
        const state=drag;drag=null;wheel.style.scrollSnapType='';
        if(wheel.hasPointerCapture(event.pointerId))wheel.releasePointerCapture(event.pointerId);
        choose(kind,state.moved||state.value===null?Math.round(wheel.scrollTop/rowHeight):columns[kind].values.indexOf(state.value),true);
        suppressClick=true;setTimeout(()=>{suppressClick=false;},0);
      };
      wheel.addEventListener('pointerup',finishDrag);wheel.addEventListener('pointercancel',finishDrag);
    }
    dialog.querySelector('[data-picker-cancel]').onclick=()=>dialog.close();
    dialog.querySelector('[data-picker-confirm]').onclick=()=>{
      // Read the nearest row even if a native touch scroll is still decelerating.
      choose('year',Math.round(wheels.year.scrollTop/rowHeight),true);
      choose('month',Math.round(wheels.month.scrollTop/rowHeight),true);
      const input=inputs[active];input.value=clamp(valueOf(),bounds.min,bounds.max);
      input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();
    };
    dialog.addEventListener('click',event=>{
      if(event.target!==dialog)return;
      const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)dialog.close();
    });
    dialog.addEventListener('close',()=>{
      for(const trigger of Object.values(triggers))trigger.setAttribute('aria-expanded','false');
      if(active)triggers[active].focus({preventScroll:true});
    });
  }
  root.MonthDial={mount};
})(window);
