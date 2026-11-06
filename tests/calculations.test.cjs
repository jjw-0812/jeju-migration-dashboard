const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../migration.js');
const metric=(n=5)=>({state:'ok',all:n*2,total:[n,n],youth:[n*2,n*2],ageBands:{'10':[n,n+1],'20':[n,n],'90':[n+2,n+3]}});
const row=(code,n=5)=>({code,name:code,inbound:metric(n),outbound:metric(n+1)});
const data=(rows,month='202609')=>({month,rows});
test('decades, sex filters, missing ages, and genuine zeros stay distinct',()=>{
  assert.equal(M.read(metric(),'10','both'),11);
  assert.equal(M.read(metric(),'10','0'),5);
  assert.equal(M.read(metric(),'90','1'),8);
  assert.equal(M.read(metric(),'30','both'),null);
  assert.equal(M.read({state:'empty'},'all','both'),null);
  assert.equal(M.read(metric(0),'20','both'),0);
  assert.equal(M.read({state:'ok',ageBands:{10:[0,null]}},'10','both'),null);
  assert.equal(M.difference(null,5),null);
});
test('July boundary harmonizes old two regions with one merged region without double counting',()=>{
  const before=M.monthRows(data([row('29',2),row('46',3)]),'all','both',true);
  const after=M.monthRows(data([row('12',5)]),'all','both',true);
  assert.equal(before.length,1);assert.equal(before[0].a,10);assert.equal(after[0].a,10);
  const absent=M.monthRows(data([row('29')]),'all','both',true);
  assert.equal(absent[0].a,null);
  const duplicated=M.monthRows(data([row('29'),row('46'),row('12')]),'all','both',true);
  assert.equal(duplicated[0].a,null);
});
test('annual sums use the same requested months, preserve missing months and retain 12 rows',()=>{
  const slots=Array.from({length:12},(_,i)=>({data:data([row('11',i+1),row('12',1)])}));
  const report=M.annualReport(slots,2,'all','both');
  assert.equal(report.months.length,12);assert.equal(report.a,10);assert.equal(report.b,18);assert.equal(report.net,-8);
  assert.equal(report.countA,2);assert.equal(report.rows.find(r=>r.code==='11').a,6);
  slots[1]={error:'timeout'};
  const missing=M.annualReport(slots,2,'all','both');
  assert.equal(missing.a,null);assert.equal(missing.countA,1);assert.equal(missing.months[1].error,'timeout');
  assert.equal(missing.rows.find(r=>r.code==='11').a,null);
  assert.equal(M.annualReport(Array(12).fill(null),2,'all','both').a,null);
});
function backend() {
  const cache=new Map();const properties={DATA_GO_KR_SERVICE_KEY:'synthetic-test-key'};let requests=[];
  const context={PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k]})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},
    LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
    Utilities:{formatDate:()=> '202611'},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:s=>({text:s,setMimeType(){return this;}})},
    UrlFetchApp:{fetchAll:r=>{requests=r;return r.map(()=>response(ageRow()));}}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/Code.gs','utf8'),context);
  return {context,cache,requests:()=>requests};
}
function ageRow(){const r={maleNmprCnt:'123',femlNmprCnt:'234'};for(let age=0;age<=110;age++){r['male'+age+'AgeNmprCnt']=String(age);r['feml'+age+'AgeNmprCnt']=String(age*2);}return r;}
function response(row,code='0',count=1){return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({Response:{head:{resultCode:code,totalCount:count},items:{item:row}}})};}
test('Apps Script parses actual Response/head/items format and age boundaries 10–99',()=>{
  const {context}=backend();const row=ageRow();let parsed=context.parse_(response(row));
  assert.equal(parsed.ageBands['10'][0],145);assert.equal(parsed.ageBands['90'][1],1890);
  assert.equal(parsed.youth[0],590);assert.equal(parsed.all,357);
  delete row.male99AgeNmprCnt;parsed=context.parse_(response(row));
  assert.equal(parsed.ageBands['90'][0],null);assert.equal(parsed.ageBands['90'][1],1890);
  assert.equal(parsed.ageBands['20'][0],245);
  assert.equal(context.parse_(response([], '0',0)).state,'empty');
  assert.equal(context.parse_(response({},'11')).state,'error');
  assert.equal(context.parse_(response([ageRow(),ageRow()],'0',2)).state,'error');
});
test('Apps Script monthly routing, cache and health capabilities work without discovery',()=>{
  const b=backend();const june=b.context.monthly_('202606');assert.equal(june.rows.length,16);assert.equal(b.requests().length,32);
  const july=b.context.monthly_('202607');assert.equal(july.rows.length,15);assert.equal(b.requests().length,30);
  assert(july.rows.some(r=>r.code==='12'));assert(!july.rows.some(r=>r.code==='29'||r.code==='46'));
  assert(b.requests().every(r=>typeof r.url==='string' && r.followRedirects===false));
  const cached=b.context.monthly_('202607');assert.equal(cached.rows[0].inbound.ageBands['10'][0],145);
  const health=JSON.parse(b.context.doGet({parameter:{action:'health'}}).text);assert(health.features.includes('ageBands'));
  assert.equal(JSON.parse(b.context.doGet({parameter:{month:'202611'}}).text).ok,false);
  assert.equal(JSON.parse(b.context.doGet({parameter:{month:'202313'}}).text).ok,false);
  assert(!b.context.doGet({parameter:{callback:'alert(1)'}}).text.startsWith('alert'));
});
test('custom periods include both endpoints and roll December into January',()=>{
  assert.deepEqual(M.monthRange('2025-11','2026-02','2026-10'),['202511','202512','202601','202602']);
  assert.deepEqual(M.monthRange('2026-09','2026-09','2026-10'),['202609']);
  assert.equal(M.monthRange('2024-01','2026-10','2026-10').length,34);
  assert.throws(()=>M.monthRange('2026-09','2026-08','2026-10'),/빠를/);
  assert.throws(()=>M.monthRange('2023-12','2024-01','2026-10'),/2024/);
  assert.throws(()=>M.monthRange('2026-10','2026-11','2026-10'),/지난달/);
  assert.throws(()=>M.monthRange('2025-13','2026-02','2026-10'),/선택/);
});
test('custom period reports include all months beyond a calendar year, including missing months',()=>{
  const slots=Array.from({length:15},()=>({data:data([row('11',2),row('12',3)])}));
  const report=M.periodReport(slots,15,'all','both');
  assert.equal(report.months.length,15);assert.equal(report.a,150);assert.equal(report.countA,15);
  slots[14]={error:'unpublished'};
  const missing=M.periodReport(slots,15,'all','both');
  assert.equal(missing.a,null);assert.equal(missing.countA,14);assert.equal(missing.months[14].error,'unpublished');
});
test('map colors distinguish missing, zero and maxima using a shared scale',()=>{
  const map=require('../region-map.js');
  assert.equal(map.maximum([{a:50,b:100},{a:null,b:0}]),100);
  assert.equal(map.maximum([{a:null,b:null}]),0);
  assert.equal(map.color(null,100,'a'),map.missing);
  assert.notEqual(map.color(0,100,'a'),map.missing);
  assert.equal(map.color(100,100,'a'),'#99000d');
  assert.equal(map.color(100,100,'b'),'#08306b');
  assert.equal(map.color(0,0,'a'),map.color(0,100,'a'));
});
test('map boundary codes match the API and include the verified merged region and Jeju',()=>{
  const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('map-regions.js','utf8'),context);
  const regions=context.window.JejuMapRegions.regions;
  assert.equal(regions.length,16);assert.equal(new Set(regions.map(r=>r.code)).size,16);
  assert(regions.some(r=>r.code==='12'&&r.name==='전남광주통합특별시'));
  assert(regions.some(r=>r.code==='50'));assert(!regions.some(r=>r.code==='29'||r.code==='46'));
  assert(regions.every(r=>r.d.startsWith('M') && !/NaN|undefined/.test(r.d)));
});
