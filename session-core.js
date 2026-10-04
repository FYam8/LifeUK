/* LifeUK session rules. Raw questions and lifetime history are never deleted. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LifeUKSession=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const VERSION=4;
  // Manually reviewed equivalent learning objective, not a general topic filter.
  const EQUIVALENTS=Object.freeze({});
  const norm=text=>String(text).normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/\s+/g,' ').trim();
  function questionKey(q){return EQUIVALENTS[q.id]||JSON.stringify([norm(q.question),q.type,q.required_selection_count,q.options.map(o=>norm(o.text)).sort(),q.options.filter(o=>q.correct_option_ids.includes(o.id)).map(o=>norm(o.text)).sort()]);}
  function groups(qs){const map=new Map();for(const q of qs){const key=questionKey(q);if(!map.has(key))map.set(key,[]);map.get(key).push(q);}return [...map.values()];}
  const uniqueQuestions=qs=>groups(qs).map(g=>g[0]);
  function latestResult(s){
    if(!s||!Number.isFinite(s.seen)||s.seen<=0)return null;
    if(typeof s.lastCorrect==='boolean')return s.lastCorrect;
    // The old engine reset streak to zero on an error and incremented it on success.
    if(s.streak>0)return true;
    if(s.streak===0&&s.wrong>0)return false;
    if(s.correct>0&&s.wrong===0)return true;
    return null;
  }
  function latestInGroup(group,progress){
    return group.map(q=>({q,s:progress[q.id],result:latestResult(progress[q.id])})).filter(x=>x.result!==null).sort((a,b)=>(Number(b.s.lastSeen)||0)-(Number(a.s.lastSeen)||0))[0]||null;
  }
  function latestSummary(qs,progress){const list=groups(qs),known=list.map(g=>latestInGroup(g,progress)).filter(Boolean),correct=known.filter(x=>x.result).length;return {total:list.length,answered:known.length,correct,wrong:known.length-correct,percent:known.length?Math.round(100*correct/known.length):null};}
  function mistakes(qs,progress){return groups(qs).map(g=>latestInGroup(g,progress)).filter(x=>x&&x.result===false).sort((a,b)=>(Number(b.s.lastSeen)||0)-(Number(a.s.lastSeen)||0)).map(x=>x.q);}
  function createSession(mode,label,qs,time){return {version:VERSION,id:`${time}-${Math.random().toString(36).slice(2)}`,mode,label,examId:mode==='exam'?qs[0]?.exam_id:null,queue:uniqueQuestions(qs).map(q=>q.id),index:0,startedAt:time,answers:{},draft:null};}
  function isCorrect(q,selected){return selected.length===q.correct_option_ids.length&&new Set(selected).size===selected.length&&selected.every(id=>q.correct_option_ids.includes(id));}
  function restoreSession(raw,bank,progress={},time=Date.now()){
    if(!raw||!['exam','review','mistakes'].includes(raw.mode)||!Array.isArray(raw.queue)||!Number.isInteger(raw.index)||raw.index<0||raw.index>raw.queue.length)return null;
    const legacy=!(raw.version>=2),completed=new Set(raw.queue.slice(0,raw.index).filter(id=>bank.has(id)).map(id=>questionKey(bank.get(id))));
    let skippedLegacyCurrent=false;const oldCurrent=raw.queue[raw.index],p=progress[oldCurrent];
    if(legacy&&bank.has(oldCurrent)&&Number.isFinite(raw.startedAt)&&p?.seen>0&&p.lastSeen>=raw.startedAt&&p.lastSeen<=time){completed.add(questionKey(bank.get(oldCurrent)));skippedLegacyCurrent=true;}
    const queue=uniqueQuestions(raw.queue.filter(id=>bank.has(id)).map(id=>bank.get(id))).map(q=>q.id);
    let index=0;while(index<queue.length&&completed.has(questionKey(bank.get(queue[index]))))index++;
    if(index===queue.length)return null;
    const answers={};if(!legacy&&raw.answers&&typeof raw.answers==='object')for(const id of queue){const a=raw.answers[id],q=bank.get(id);if(a&&Array.isArray(a.selected)&&a.selected.length===q.required_selection_count&&new Set(a.selected).size===a.selected.length&&a.selected.every(x=>q.options.some(o=>o.id===x)))answers[id]={selected:[...a.selected],ok:isCorrect(q,a.selected),answeredAt:a.answeredAt};}
    const current=bank.get(queue[index]);let draft=null;
    if(!legacy&&raw.draft?.id===current.id&&Array.isArray(raw.draft.selected))draft={id:current.id,selected:[...new Set(raw.draft.selected)].filter(id=>current.options.some(o=>o.id===id))};
    return {version:VERSION,id:String(raw.id||`legacy-${raw.startedAt||time}`),mode:raw.mode,label:String(raw.label||'Session'),examId:raw.mode==='exam'?bank.get(queue[0]).exam_id:null,queue,index,startedAt:Number.isFinite(raw.startedAt)?raw.startedAt:time,answers,draft,migrated:legacy||!!raw.migrated,skippedLegacyCurrent:skippedLegacyCurrent||!!raw.skippedLegacyCurrent};
  }
  function recordAnswer(s,q,selected,time){if(!s||s.queue[s.index]!==q.id||s.answers[q.id]||selected.length!==q.required_selection_count||new Set(selected).size!==selected.length||!selected.every(id=>q.options.some(o=>o.id===id)))return null;const a={selected:[...selected],ok:isCorrect(q,selected),answeredAt:time};s.answers[q.id]=a;s.draft=null;return a;}
  function advance(s){if(!s||!s.answers[s.queue[s.index]])return false;s.index++;s.draft=null;return true;}
  function sessionScore(s){const answers=Object.values(s.answers),correct=answers.filter(a=>a.ok).length;return {total:s.queue.length,answered:answers.length,correct,percent:answers.length?Math.round(100*correct/answers.length):null,complete:answers.length===s.queue.length};}
  return Object.freeze({VERSION,EQUIVALENTS,questionKey,uniqueQuestions,groups,latestResult,latestSummary,mistakes,createSession,restoreSession,recordAnswer,advance,isCorrect,sessionScore});
});
