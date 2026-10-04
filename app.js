(() => {
  'use strict';
  const DATA_FILES = [
    'data/life_in_the_uk_exam01.json',
    'data/life_in_the_uk_exam02.json',
    'data/life_in_the_uk_exam03.json',
    'data/life_in_the_uk_exam04.json'
  ];
  const STORAGE_KEY='lifeuk_state_v1';
  const ACTIVE_KEY='lifeuk_active_session_v1';
  const SCHEMA_VERSION=1;
  let exams=[], bank=new Map(), session=null, current=null, selected=new Set(), checked=false;
  const $=id=>document.getElementById(id);
  const now=()=>Date.now();
  const blankState=()=>({schemaVersion:SCHEMA_VERSION,stats:{answered:0,correct:0},questions:{},updatedAt:now()});
  function loadState(){try{return {...blankState(),...JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}')}}catch{return blankState()}}
  let state=loadState();
  function saveState(){state.updatedAt=now();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderMetrics()}
  function qState(id){return state.questions[id] ||= {seen:0,correct:0,wrong:0,streak:0,mastered:false,lastSeen:0,nextDue:0}}
  function shuffle(a){const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]]}return x}
  function normalize(exam){return exam.questions.map(q=>({...q,exam_title:exam.title}))}
  async function init(){
    exams=await Promise.all(DATA_FILES.map(f=>fetch(f,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(f);return r.json()})));
    exams.forEach(e=>normalize(e).forEach(q=>bank.set(q.id,q)));
    renderExamGrid();renderMetrics();restoreResume();bind();
  }
  function bind(){
    $('homeBtn').onclick=showHome;$('exitBtn').onclick=saveAndExit;$('resumeBtn').onclick=resume;$('reviewBtn').onclick=startReview;
    $('checkBtn').onclick=checkAnswer;$('nextBtn').onclick=nextQuestion;$('exportBtn').onclick=exportProgress;$('importInput').onchange=importProgress;$('resetBtn').onclick=resetProgress;
  }
  function renderExamGrid(){
    $('examGrid').innerHTML='';
    exams.forEach(exam=>{
      const qs=normalize(exam), done=qs.filter(q=>qState(q.id).seen>0).length, mastered=qs.filter(q=>qState(q.id).mastered).length;
      const b=document.createElement('button');b.className='exam-btn';b.innerHTML=`<strong>${exam.title.replace('Life in the UK — ','')}</strong><small>${qs.length} questions · ${done} seen · ${mastered} mastered</small>`;
      b.onclick=()=>startExam(exam.source.exam_label,qs);$('examGrid').appendChild(b);
    })
  }
  function renderMetrics(){
    const all=[...bank.keys()].map(qState), mastered=all.filter(x=>x.mastered).length;
    $('mAnswered').textContent=state.stats.answered||0;$('mAccuracy').textContent=state.stats.answered?Math.round(100*state.stats.correct/state.stats.answered)+'%':'—';$('mMastered').textContent=mastered;
    if(exams.length) renderExamGrid();
  }
  function startExam(label,qs){
    session={mode:'exam',label,queue:shuffle(qs.map(q=>q.id)),index:0,startedAt:now()};persistSession();showStudy();loadCurrent();
  }
  function startReview(){
    const t=now();let ids=[...bank.keys()].filter(id=>{const s=qState(id);return s.seen>0 && (!s.mastered || s.nextDue<=t)});
    if(!ids.length) ids=[...bank.keys()].filter(id=>qState(id).seen>0 && !qState(id).mastered);
    if(!ids.length){alert('No review items yet. Start an exam first.');return}
    ids.sort((a,b)=>(qState(a).streak-qState(b).streak)||(qState(a).lastSeen-qState(b).lastSeen));
    session={mode:'review',label:'Review',queue:ids,index:0,startedAt:now()};persistSession();showStudy();loadCurrent();
  }
  function persistSession(){localStorage.setItem(ACTIVE_KEY,JSON.stringify(session));restoreResume()}
  function restoreResume(){
    try{const s=JSON.parse(localStorage.getItem(ACTIVE_KEY)||'null');if(s&&Array.isArray(s.queue)&&s.index<s.queue.length){$('resumeBtn').disabled=false;$('resumeHint').textContent=`${s.label}: question ${s.index+1} of ${s.queue.length}`;return}}catch{}
    $('resumeBtn').disabled=true;$('resumeHint').textContent='No active session yet.';
  }
  function resume(){try{session=JSON.parse(localStorage.getItem(ACTIVE_KEY));if(!session)return;showStudy();loadCurrent()}catch{}}
  function showStudy(){$('homeView').classList.add('hidden');$('studyView').classList.remove('hidden');$('homeBtn').classList.remove('hidden')}
  function showHome(){$('studyView').classList.add('hidden');$('homeView').classList.remove('hidden');$('homeBtn').classList.add('hidden');renderMetrics();restoreResume()}
  function saveAndExit(){persistSession();showHome()}
  function loadCurrent(){
    if(!session||session.index>=session.queue.length){finishSession();return}
    current=bank.get(session.queue[session.index]);if(!current){session.index++;persistSession();loadCurrent();return}
    selected=new Set();checked=false;$('feedback').className='feedback hidden';$('feedback').innerHTML='';$('nextBtn').classList.add('hidden');$('checkBtn').classList.remove('hidden');$('checkBtn').disabled=true;
    $('sessionLabel').textContent=session.label;$('counter').textContent=`${session.index+1} / ${session.queue.length}`;$('progressFill').style.width=`${100*session.index/session.queue.length}%`;
    const st=qState(current.id);$('streakLabel').textContent=`Streak ${st.streak}/4${st.mastered?' · Mastered':''}`;$('questionText').textContent=current.question;
    $('multiHint').classList.toggle('hidden',current.required_selection_count<=1);
    const opts=$('options');opts.innerHTML='';current.options.forEach(o=>{const b=document.createElement('button');b.className='option';b.dataset.id=o.id;b.innerHTML=`<span class="badge">${o.id.toUpperCase()}</span><span>${escapeHtml(o.text)}</span>`;b.onclick=()=>selectOption(o.id,b);opts.appendChild(b)})
  }
  function selectOption(id,el){if(checked)return;const multi=current.required_selection_count>1;if(multi){selected.has(id)?selected.delete(id):selected.add(id)}else{selected.clear();selected.add(id)};[...$('options').children].forEach(b=>b.classList.toggle('selected',selected.has(b.dataset.id)));$('checkBtn').disabled=selected.size!==current.required_selection_count}
  function checkAnswer(){
    if(checked)return;checked=true;const correct=[...current.correct_option_ids].sort(), given=[...selected].sort(), ok=correct.length===given.length&&correct.every((x,i)=>x===given[i]);
    [...$('options').children].forEach(b=>{const id=b.dataset.id;if(current.correct_option_ids.includes(id))b.classList.add('correct');else if(selected.has(id))b.classList.add('wrong');b.disabled=true});
    const s=qState(current.id);s.seen++;s.lastSeen=now();state.stats.answered++;if(ok){s.correct++;s.streak++;state.stats.correct++;if(s.streak>=4)s.mastered=true;s.nextDue=now()+dueDelay(s.streak)}else{s.wrong++;s.streak=0;s.mastered=false;s.nextDue=now()+5*60*1000;injectRetry(current.id)}saveState();
    const f=$('feedback');f.className='feedback '+(ok?'good':'bad');f.innerHTML=`<b>${ok?'Correct':'Not quite'}</b><div>${escapeHtml(current.explanation_original||'')}</div>`;
    $('checkBtn').classList.add('hidden');$('nextBtn').classList.remove('hidden');$('streakLabel').textContent=`Streak ${s.streak}/4${s.mastered?' · Mastered':''}`;persistSession();
  }
  function dueDelay(streak){return [0,6*3600e3,24*3600e3,3*86400e3,7*86400e3][Math.min(streak,4)]||7*86400e3}
  function injectRetry(id){if(!session)return;const pos=Math.min(session.queue.length,session.index+3+Math.floor(Math.random()*3));session.queue.splice(pos,0,id)}
  function nextQuestion(){session.index++;persistSession();loadCurrent()}
  function finishSession(){localStorage.removeItem(ACTIVE_KEY);$('progressFill').style.width='100%';alert('Session complete. Progress has been saved.');showHome()}
  function exportProgress(){const blob=new Blob([JSON.stringify({app:'LifeUK',schemaVersion:SCHEMA_VERSION,state},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='lifeuk-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function importProgress(ev){const file=ev.target.files&&ev.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{const x=JSON.parse(r.result);if(!x.state||x.schemaVersion!==SCHEMA_VERSION)throw new Error();state=x.state;saveState();renderExamGrid();alert('Progress imported.')}catch{alert('This progress file is not compatible.')}};r.readAsText(file);ev.target.value=''}
  function resetProgress(){if(!confirm('Reset all LifeUK progress on this device?'))return;localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(ACTIVE_KEY);state=blankState();renderMetrics();renderExamGrid();restoreResume()}
  function escapeHtml(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
  init().catch(err=>{document.body.innerHTML=`<div class="wrap"><section class="card"><h1>Unable to load LifeUK data</h1><p>${escapeHtml(err.message)}</p></section></div>`})
})();