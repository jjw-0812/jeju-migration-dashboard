/* Shared browser/Node calculations. Missing data always remains null. */
(function (root) {
  'use strict';
  const sum = values => values.length && values.every(Number.isSafeInteger)
    ? values.reduce((a, b) => a + b, 0) : null;
  const difference = (a, b) => Number.isSafeInteger(a) && Number.isSafeInteger(b) ? a - b : null;
  function read(item, age, sex) {
    if (!item || item.state !== 'ok') return null;
    if (age === 'all') return sex === 'both' ? (Number.isSafeInteger(item.all) ? item.all : null)
      : (Number.isSafeInteger(item.total?.[sex]) ? item.total[sex] : null);
    const pair = age === 'youth' ? item.youth : item.ageBands?.[age];
    return sex === 'both' ? sum(pair || []) : (Number.isSafeInteger(pair?.[sex]) ? pair[sex] : null);
  }
  function reason(item, value) {
    return value !== null ? '정상' : !item ? '응답 없음' : item.state === 'empty'
      ? '자료 없음' : item.reason || '선택 연령·성별 자료 없음';
  }
  function monthRows(data, age, sex, harmonize = false) {
    if (!data || !Array.isArray(data.rows) || !data.rows.length) return [];
    let rows = data.rows.map(row => {
      const a = read(row.inbound, age, sex), b = read(row.outbound, age, sex);
      return {code:row.code, name:row.name, a, b, net:difference(a,b),
        ins:reason(row.inbound,a), outs:reason(row.outbound,b)};
    });
    if (harmonize) {
      const old = rows.filter(r => r.code === '29' || r.code === '46');
      const merged = rows.filter(r => r.code === '12');
      rows = rows.filter(r => !['29','46','12'].includes(r.code));
      const sources = merged.length === 1 && old.length === 0 ? merged
        : old.length === 2 && merged.length === 0 ? old : [];
      const a = sum(sources.map(r=>r.a)), b = sum(sources.map(r=>r.b));
      rows.push({code:'12',name:'광주·전남(통합 기준)',a,b,net:difference(a,b),
        ins:a === null ? '광주·전남 자료 확인 필요' : '정상',
        outs:b === null ? '광주·전남 자료 확인 필요' : '정상'});
    }
    return rows;
  }
  function totals(rows) {
    const a = sum(rows.map(r=>r.a)), b = sum(rows.map(r=>r.b));
    return {a,b,net:difference(a,b),countA:rows.filter(r=>r.a!==null).length,
      countB:rows.filter(r=>r.b!==null).length,count:rows.length};
  }
  function monthRange(start, end, latest) {
    const valid = value => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
    if (!valid(start) || !valid(end)) throw Error('시작연월과 종료연월을 선택해 주세요.');
    if (start < '2024-01' || end > latest) throw Error('2024년 1월부터 지난달까지 선택할 수 있습니다.');
    if (start > end) throw Error('종료연월은 시작연월보다 빠를 수 없습니다.');
    const months=[];
    let year=Number(start.slice(0,4)), month=Number(start.slice(5));
    while (`${year}-${String(month).padStart(2,'0')}` <= end) {
      months.push(String(year)+String(month).padStart(2,'0'));
      if (++month===13) {year++;month=1;}
    }
    return months;
  }
  function periodReport(slots, limit, age, sex) {
    const months = Array.from({length:slots.length},(_,i)=>{
      const slot = slots[i];
      const rows = monthRows(slot?.data,age,sex,true);
      const total = totals(rows);
      return {...total,rows,error:slot?.error || '',asOf:slot?.data?.asOf};
    });
    const selected = months.slice(0,limit);
    const a = sum(selected.map(m=>m.a)), b = sum(selected.map(m=>m.b));
    const codes = new Map();
    selected.forEach(m=>m.rows.forEach(r=>codes.set(r.code,r.name)));
    const rows = [...codes].map(([code,name])=>{
      const perMonth = selected.map(m=>m.rows.find(r=>r.code===code));
      const a=sum(perMonth.map(r=>r?.a ?? null)), b=sum(perMonth.map(r=>r?.b ?? null));
      const countA=perMonth.filter(r=>r && r.a!==null).length;
      const countB=perMonth.filter(r=>r && r.b!==null).length;
      return {code,name,a,b,net:difference(a,b),ins:countA===limit?'정상':`${countA}/${limit}개월 확인`,
        outs:countB===limit?'정상':`${countB}/${limit}개월 확인`};
    });
    return {months,rows,a,b,net:difference(a,b),limit,
      countA:selected.filter(m=>m.a!==null).length,countB:selected.filter(m=>m.b!==null).length};
  }
  function annualReport(slots, limit, age, sex) {
    return periodReport(Array.from({length:12},(_,i)=>slots[i] || null),limit,age,sex);
  }
  const api = {sum,difference,read,reason,monthRows,totals,annualReport,periodReport,monthRange};
  if (typeof module !== 'undefined' && module.exports) module.exports=api;
  else root.MigrationData=api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
