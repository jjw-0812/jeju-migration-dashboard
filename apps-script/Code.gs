const BUILD_VERSION = 'jeju-youth1939-20261106-v7';
const API = 'https://apis.data.go.kr/1741000/ppltnDataStus/selectPpltnDataStus';
const JEJU = '5000000000';
const REGIONS = [
  ['11','서울'], ['26','부산'], ['27','대구'], ['28','인천'], ['29','광주'],
  ['30','대전'], ['31','울산'], ['36','세종'], ['41','경기'], ['51','강원'],
  ['43','충북'], ['44','충남'], ['52','전북'], ['46','전남'], ['47','경북'], ['48','경남']
];

function doGet(e) {
  const p = e && e.parameter || {};
  const callback = p.callback || '';
  if (callback && !/^jejuCb_[a-z0-9]{1,40}$/.test(callback)) {
    return output_({ok:false,error:'잘못된 콜백입니다.'}, '');
  }
  try {
    if (p.action === 'health') return output_({ok:true,keyConfigured:!!key_(),version:BUILD_VERSION,features:['ageBands','youth1939']}, callback);
    const month = String(p.month || '');
    const latest = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMM');
    if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(month) || month < '202401' || month >= latest) {
      throw new Error('2024년 1월부터 지난달까지 조회할 수 있습니다.');
    }
    return output_(monthly_(month), callback);
  } catch (err) {
    return output_({ok:false,error:err.message}, callback);
  }
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  return ContentService.createTextOutput(callback ? callback + '(' + json + ');' : json)
    .setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON);
}

function key_() {
  return (PropertiesService.getScriptProperties().getProperty('DATA_GO_KR_SERVICE_KEY') || '').trim();
}

function monthly_(month) {
  const key = key_();
  if (!key) throw new Error('스크립트 속성 DATA_GO_KR_SERVICE_KEY를 설정하세요.');
  let regions = REGIONS;
  if (month >= '202607') {
    // Code 12 was verified against the API in this project's 2026-09 data.
    const savedRegion = PropertiesService.getScriptProperties().getProperty('JEJU_MERGED_REGION');
    const region = savedRegion ? JSON.parse(savedRegion) : {code:'12',name:'전남광주통합특별시'};
    if (!/^\d{2}$/.test(region.code) || !/광주/.test(region.name) || !/전남|전라남/.test(region.name) || REGIONS.some(r=>r[0]===region.code)) {
      throw new Error('통합 지역 설정을 확인하세요.');
    }
    regions = REGIONS.filter(r=>r[0]!=='29' && r[0]!=='46').concat([[region.code,region.name]]);
  }
  const cache = CacheService.getScriptCache();
  const cacheId = BUILD_VERSION + '-' + month;
  const saved = cache.get(cacheId);
  if (saved) return JSON.parse(saved);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) throw new Error('다른 조회를 처리 중입니다. 잠시 후 다시 시도하세요.');
  try {
    const cached = cache.get(cacheId);
    if (cached) return JSON.parse(cached);
    const requests = regions.flatMap(([prefix]) => {
      const other = prefix + '00000000';
      return [request_(JEJU, other, month, key), request_(other, JEJU, month, key)];
    });
    let responses;
    try {
      responses = UrlFetchApp.fetchAll(requests);
    } catch (_) {
      throw new Error('공공데이터 API에 연결할 수 없습니다.');
    }
    const rows = regions.map(([code, name], i) => ({
      code, name, inbound:parse_(responses[i*2]), outbound:parse_(responses[i*2+1])
    }));
    const data = {ok:true,version:BUILD_VERSION,month,rows,asOf:new Date().toISOString()};
    const results = rows.flatMap(r => [r.inbound,r.outbound]);
    const complete = results.every(r => r.state === 'ok');
    if (complete || results.some(r => r.state !== 'error')) {
      cache.put(cacheId, JSON.stringify(data), complete ? 21600 : 600);
    }
    return data;
  } finally {
    lock.releaseLock();
  }
}

function request_(to, from, month, key) {
  const params = {serviceKey:key,mvinAdmmCd:to,mvtAdmmCd:from,srchFrYm:month,
    srchToYm:month,lv:'1',type:'json',numOfRows:10,pageNo:1};
  return {url:API+'?'+Object.entries(params).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&'),
    method:'get',muteHttpExceptions:true,followRedirects:false};
}

function parse_(response) {
  const status = response.getResponseCode();
  const raw = response.getContentText();
  try {
    let root;
    if (raw.trim().startsWith('<')) {
      const xml = XmlService.parse(raw).getRootElement();
      const section = xml.getChild('body');
      const head = xml.getChild('header') || xml.getChild('cmmMsgHeader') || xml;
      const items = section && section.getChild('items');
      root = {header:{resultCode:head.getChildText('resultCode') || head.getChildText('returnReasonCode')},
        body:{totalCount:section && section.getChildText('totalCount'),
          items:items ? items.getChildren('item').map(item=>Object.fromEntries(item.getChildren().map(x=>[x.getName(),x.getText()]))) : []}};
    } else {
      const parsed = JSON.parse(raw);
      root = parsed.Response || parsed.response || parsed.OpenAPI_ServiceResponse || parsed;
    }
    // 일반 response/body/items 및 서비스별 head/row 응답을 지원합니다.
    function normalize(node, depth) {
      if (!node || typeof node !== 'object' || depth > 8) return null;
      if (Array.isArray(node)) {
        const head = node.find(x => x && x.head);
        const rows = node.find(x => x && Object.prototype.hasOwnProperty.call(x, 'row'));
        if (rows) {
          const headValue = head && head.head || [];
          const metadata = Object.assign({}, ...(Array.isArray(headValue) ? headValue : [headValue]));
          const result = metadata.RESULT || metadata.result || metadata;
          return {code:result.resultCode ?? result.CODE ?? '', count:metadata.totalCount ?? metadata.list_total_count,
            items:rows.row};
        }
        for (const child of node) { const found = normalize(child, depth+1); if (found) return found; }
        return null;
      }
      const header = node.head || node.header || node.cmmMsgHeader || {};
      const code = header.resultCode ?? header.returnReasonCode ?? node.resultCode ?? node.returnReasonCode;
      const body = node.body || node;
      if (Object.prototype.hasOwnProperty.call(body, 'items') || Object.prototype.hasOwnProperty.call(body, 'item') ||
          Object.prototype.hasOwnProperty.call(body, 'row')) {
        const items = body.items ?? body.item ?? body.row;
        return {code:code ?? '', count:body.totalCount ?? header.totalCount, items:items && (items.item ?? items)};
      }
      if (code !== undefined) return {code, count:body.totalCount, items:undefined};
      for (const name of Object.keys(node)) {
        const found = normalize(node[name], depth+1);
        if (found) return found;
      }
      return null;
    }
    const normalized = normalize(root, 0);
    const code = String(normalized && normalized.code || '');
    if (status < 200 || status >= 300) return {state:'error',reason:'HTTP '+status};
    if (/^0?3$/.test(code) || code === 'INFO-200') return {state:'empty'};
    if (code && !/^0+$/.test(code) && code !== 'INFO-000') {
      return {state:'error',reason:'API '+(/^[A-Za-z0-9_-]{1,30}$/.test(code) ? code : '오류')};
    }
    if (!normalized) return {state:'error',reason:'응답 구조 확인 필요 (diagnoseApiStructure 실행)'};
    const value = normalized.items;
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
    if (!list.length) {
      const count = normalized.count;
      return count !== undefined && count !== null && String(count).trim() !== '' && Number(count) === 0
        ? {state:'empty'} : {state:'error',reason:'데이터 목록 없음 (diagnoseApiStructure 실행)'};
    }
    if (list.length !== 1 || Number(normalized.count) > 1) return {state:'error',reason:'시도 쌍별 응답 행이 여러 건입니다.'};
    const row = list[0];
    const read = names => {
      for (const name of names) {
        const v = String(row[name] ?? '').trim().replace(/,/g,'');
        if (/^\d+$/.test(v) && Number.isSafeInteger(Number(v))) return Number(v);
      }
      return null;
    };
    const total = ['male','feml'].map((sex,i) => read(i ? ['femlNmprCnt','femaleNmprCnt','femlPpltnCnt'] : ['maleNmprCnt','malePpltnCnt']));
    const ageBands = {};
    for (let start = 0; start <= 100; start += 10) {
      ageBands[String(start)] = ['male','feml'].map(sex => {
        const counts = Array.from({length:10},(_,i)=>read([sex+(start+i)+'AgeNmprCnt']));
        return counts.some(n=>n===null) ? null : counts.reduce((a,b)=>a+b,0);
      });
    }
    const youth = [0,1].map(sex => {
      const counts = [ageBands['20'][sex],ageBands['30'][sex]];
      return counts.some(n=>n===null) ? null : counts[0]+counts[1];
    });
    // Keep legacy youth (20-39) for older clients; expose 19-39 separately.
    const youth1939 = ['male','feml'].map((sex,i) => {
      const counts = [read([sex+'19AgeNmprCnt']),ageBands['20'][i],ageBands['30'][i]];
      return counts.some(n=>n===null) ? null : counts.reduce((a,b)=>a+b,0);
    });
    const all = read(['totNmprCnt','totPpltnCnt','totalNmprCnt','totalPpltnCnt']) ?? (total.includes(null) ? null : total[0]+total[1]);
    if (all === null && [...total,...youth].every(n=>n===null)) return {state:'error',reason:'인구수 응답 필드 확인 필요'};
    return {state:'ok',all,total,youth,youth1939,ageBands};
  } catch (_) {
    return {state:'error',reason:'HTTP '+status+' / 응답 해석 실패'};
  }
}

// Run this from the editor before updating the existing web-app deployment.
function testApi() {
  const data = monthly_('202609');
  console.log(JSON.stringify({version:BUILD_VERSION,month:data.month,rows:data.rows.map(r=>({
    name:r.name,inbound:r.inbound.state,outbound:r.outbound.state,
    inboundReason:r.inbound.reason,outboundReason:r.outbound.reason,
    inboundTotal:r.inbound.all,outboundTotal:r.outbound.all,
    inboundAgeBands:r.inbound.ageBands,outboundAgeBands:r.outbound.ageBands,
    inboundYouth1939:r.inbound.youth1939,outboundYouth1939:r.outbound.youth1939
  }))},null,2));
}
