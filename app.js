(() => {
  'use strict';
  const Core=globalThis.LifeUKSession,BUILD='20261004-progress-1';
  const DATA_FILES=Array.from({length:17},(_,i)=>`data/life_in_the_uk_exam${String(i+1).padStart(2,'0')}.json`);
  const STORAGE_KEY='lifeuk_state_v1',ACTIVE_KEY='lifeuk_active_session_v1',SCHEMA_VERSION=1;
  const $=id=>document.getElementById(id),now=()=>Date.now(),copy=x=>JSON.parse(JSON.stringify(x));
  const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
  const blankState=()=>({schemaVersion:SCHEMA_VERSION,stats:{answered:0,correct:0},questions:{},lastExams:{},updatedAt:now()});
  function validState(x){return object(x)&&object(x.stats)&&Number.isFinite(x.stats.answered)&&x.stats.answered>=0&&Number.isFinite(x.stats.correct)&&x.stats.correct>=0&&x.stats.correct<=x.stats.answered&&object(x.questions)&&Object.values(x.questions).every(q=>object(q)&&['seen','correct','wrong','streak','lastSeen','nextDue'].every(k=>q[k]===undefined||(Number.isFinite(q[k])&&q[k]>=0)));}
  function readJSON(key){try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}}
  function loadState(){const x=readJSON(STORAGE_KEY);return validState(x)?{...blankState(),...x,lastExams:object(x.lastExams)?x.lastExams:{}}:blankState();}
  let state=loadState(),exams=[],bank=new Map(),all=[],session=null,current=null,selected=new Set(),checked=false;
  function qState(id){return state.questions[id] ||= {seen:0,correct:0,wrong:0,streak:0,mastered:false,lastSeen:0,nextDue:0};}
  function notify(text){$('notice').textContent=text;$('notice').classList.toggle('hidden',!text);}
  function save(){
    state.updatedAt=now();state.revision=`${state.updatedAt}-${Math.random().toString(36).slice(2)}`;state.sessionStoreVersion=1;state.activeSession=session;
    try{
      // A single authoritative snapshot commits both grading and session state.
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      // Compatibility mirror only: the snapshot above remains authoritative.
      try{if(session)localStorage.setItem(ACTIVE_KEY,JSON.stringify(session));else localStorage.removeItem(ACTIVE_KEY);}catch{}
      return true;
    }catch{notify('Progress could not be saved on this device. Export your progress before closing this page.');return false;}
  }
  function restore(){const raw=state.sessionStoreVersion===1?state.activeSession:readJSON(ACTIVE_KEY);session=Core.restoreSession(raw,bank,state.questions,now());}
  function syncOtherTab(){const x=readJSON(STORAGE_KEY);if(validState(x)&&x.revision&&x.revision!==state.revision){state={...blankState(),...x,lastExams:object(x.lastExams)?x.lastExams:{}};restore();showHome();notify('Progress changed in another tab. Use Resume to continue the saved session.');return true;}return false;}
  const shuffle=a=>{const x=[...a];for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];}return x;};
  async function init(){
    if(!Core)throw new Error('Session rules did not load. Please reload.');
    exams=await Promise.all(DATA_FILES.map(async f=>{const r=await fetch(f,{cache:'no-store'});if(!r.ok)throw new Error(f);return r.json();}));
    all=exams.flatMap(e=>e.questions);for(const q of all){if(bank.has(q.id))throw new Error('Duplicate question ID: '+q.id);bank.set(q.id,q);}
    $('examSummary').textContent=`Exam 1–${exams.length} · ${all.length} questions. Source wording is preserved.`;
    $('buildLabel').textContent='LifeUK '+BUILD;restore();save();bind();renderHome();
  }
  function bind(){
    $('homeBtn').onclick=showHome;$('exitBtn').onclick=()=>{save();showHome();};$('resumeBtn').onclick=()=>{if(syncOtherTab())return;if(session){showStudy();loadCurrent();}};
    $('reviewBtn').onclick=startReview;$('mistakesBtn').onclick=()=>startMistakes();$('checkBtn').onclick=checkAnswer;$('nextBtn').onclick=nextQuestion;
    $('exportBtn').onclick=exportProgress;$('importInput').onchange=importProgress;$('resetBtn').onclick=resetProgress;
    window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)syncOtherTab();});
  }
  function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function renderHome(){
    $('mAnswered').textContent=state.stats.answered;$('mAccuracy').textContent=state.stats.answered?Math.round(100*state.stats.correct/state.stats.answered)+'%':'—';
    $('mMastered').textContent=all.filter(q=>qState(q.id).mastered).length;
    const wrong=Core.mistakes(all,state.questions);$('mistakesBtn').textContent=`Mistakes only (${wrong.length})`;$('mistakesBtn').disabled=!wrong.length;
    const grid=$('examGrid');grid.replaceChildren();
    for(const exam of exams){
      const source=exam.questions,qs=Core.uniqueQuestions(source),summary=Core.latestSummary(source,state.questions),wrongQs=Core.mistakes(source,state.questions),examId=source[0].exam_id;
      const card=element('article','exam-card');card.dataset.examId=examId;
      const last=state.lastExams[examId],latestPercent=last?last.percent:summary.percent;
      const title=element('h3','',exam.source.exam_label),metric=element('div','exam-accuracy',latestPercent===null?'—':latestPercent+'%');
      const status=last?`${last.correct}/${last.total} correct · ${last.wrong||0} wrong`:`${summary.answered}/${summary.total} answered · ${summary.wrong} wrong`;
      const detail=element('p','exam-status',status);
      const meta=element('p','tiny muted',`${qs.filter(q=>qState(q.id).mastered).length} mastered`);
      card.append(title,metric,detail,meta);
      const actions=element('div','exam-actions'),start=element('button','btn exam-btn','Start'),mistakes=element('button','btn secondary mistakes-exam-btn',`Mistakes (${wrongQs.length})`);
      start.type=mistakes.type='button';start.onclick=()=>startExam(exam);mistakes.disabled=!wrongQs.length;mistakes.onclick=()=>startMistakes(exam);actions.append(start,mistakes);card.append(actions);grid.append(card);
    }
    renderResume();
  }
  function renderResume(){const active=!!session&&session.index<session.queue.length;$('resumeBtn').disabled=!active;$('resumeHint').textContent=active?`${session.label}: question ${session.index+1} of ${session.queue.length}${Core.answerAt(session,session.index)?' · Answer saved — continue with Next.':''}${session.migrated?' · Previous session upgraded.':''}`:'No active session yet.';}
  function begin(mode,label,qs){
    if(syncOtherTab())return;if(!qs.length){notify('No questions match this mode.');return;}
    if(session&&!Core.sessionScore(session).complete&&!confirm('Start a new session? Your answers and progress are kept, but the current session will be replaced.'))return;
    session=Core.createSession(mode,label,shuffle(Core.uniqueQuestions(qs)),now());save();notify('');$('sessionResult').classList.add('hidden');showStudy();loadCurrent();
  }
  function startExam(exam){begin('exam',exam.source.exam_label,exam.questions);}
  function startMistakes(exam){begin('mistakes',exam?`${exam.source.exam_label} · Mistakes only`:'All exams · Mistakes only',Core.mistakes(exam?exam.questions:all,state.questions));}
  function startReview(){const t=now();const qs=all.filter(q=>{const s=qState(q.id);return s.seen>0&&(!s.mastered||s.nextDue<=t);}).sort((a,b)=>(qState(a.id).streak-qState(b.id).streak)||(qState(a.id).lastSeen-qState(b.id).lastSeen));begin('review','Review due / weak',qs);}
  function showStudy(){$('homeView').classList.add('hidden');$('studyView').classList.remove('hidden');$('homeBtn').classList.remove('hidden');window.scrollTo(0,0);}
  function showHome(){$('studyView').classList.add('hidden');$('homeView').classList.remove('hidden');$('homeBtn').classList.add('hidden');renderHome();window.scrollTo(0,0);}
  function loadCurrent(){
    if(!session||session.index>=session.queue.length){finishSession();return;}
    current=bank.get(session.queue[session.index]);if(!current)throw new Error('Missing question');
    const answer=Core.answerAt(session,session.index);selected=new Set(answer?.selected||(session.draft?.id===current.id?session.draft.selected:[]));checked=!!answer;
    $('feedback').className='feedback hidden';$('feedback').replaceChildren();$('nextBtn').classList.add('hidden');$('checkBtn').classList.remove('hidden');
    $('sessionLabel').textContent=session.label;$('counter').textContent=`${session.index+1} / ${session.queue.length} · Exam ${Number(current.exam_id.slice(4))} · Source Q${current.number}`;
    $('progressFill').style.width=`${100*session.index/session.queue.length}%`;$('questionText').textContent=current.question;
    $('multiHint').classList.toggle('hidden',current.required_selection_count<=1);$('multiHint').textContent=`Select ${current.required_selection_count} answers, then press Check.`;
    const opts=$('options');opts.replaceChildren();for(const o of current.options){const b=element('button','option');b.type='button';b.dataset.id=o.id;b.append(element('span','badge',o.id.toUpperCase()),element('span','',o.text));b.onclick=()=>selectOption(o.id);opts.append(b);}
    renderSelection();renderStreak();if(answer)renderAnswer(answer);window.scrollTo(0,0);
  }
  function renderStreak(){const s=qState(current.id);$('streakLabel').textContent=`Streak ${s.streak}/4${s.mastered?' · Mastered':''}`;}
  function renderSelection(){for(const b of $('options').children){b.classList.toggle('selected',selected.has(b.dataset.id));b.setAttribute('aria-pressed',String(selected.has(b.dataset.id)));}$('checkBtn').disabled=checked||selected.size!==current.required_selection_count;}
  function selectOption(id){if(checked||syncOtherTab())return;if(current.required_selection_count>1){selected.has(id)?selected.delete(id):selected.add(id);}else{selected.clear();selected.add(id);}session.draft={id:current.id,selected:[...selected]};save();renderSelection();}
  function checkAnswer(){
    if(checked||!current||syncOtherTab())return;const answer=Core.recordAnswer(session,current,[...selected],now());if(!answer)return;checked=true;
    const s=qState(current.id);s.seen++;s.lastSeen=answer.answeredAt;s.lastCorrect=answer.ok;state.stats.answered++;
    if(answer.ok){s.correct++;s.streak++;state.stats.correct++;s.mastered=s.streak>=4;s.nextDue=now()+dueDelay(s.streak);}else{s.wrong++;s.streak=0;s.mastered=false;s.nextDue=now()+5*60*1000;}
    const score=Core.sessionScore(session);if(session.mode==='exam'&&score.complete)state.lastExams[session.examId]={...score,sessionId:session.id,completedAt:answer.answeredAt};
    save();renderAnswer(answer);renderHome();$('feedback').scrollIntoView({block:'nearest'});
  }
  function renderAnswer(answer){
    for(const b of $('options').children){const id=b.dataset.id;b.classList.toggle('correct',current.correct_option_ids.includes(id));b.classList.toggle('wrong',answer.selected.includes(id)&&!current.correct_option_ids.includes(id));b.disabled=true;}
    const f=$('feedback');f.className='feedback '+(answer.ok?'good':'bad');f.replaceChildren(element('b','',answer.ok?'Correct':'Not quite'),element('div','',current.explanation_original||''));
    if(!answer.ok)f.append(element('p','tiny','Counted as incorrect. This question will return later in this exam; a later correct answer will not erase this mistake.'));
    $('checkBtn').classList.add('hidden');$('checkBtn').disabled=true;$('nextBtn').classList.remove('hidden');renderStreak();
  }
  function dueDelay(streak){return [0,6*3600e3,24*3600e3,3*86400e3,7*86400e3][Math.min(streak,4)]||7*86400e3;}
  function nextQuestion(){if(!checked||syncOtherTab()||!Core.advance(session))return;checked=false;if(session.index>=session.queue.length)finishSession();else{save();loadCurrent();}}
  function finishSession(){
    const result=session?{label:session.label,...Core.sessionScore(session)}:null;session=null;current=null;checked=false;save();showHome();
    if(result){const panel=$('sessionResult');panel.classList.remove('hidden');panel.textContent=`${result.label} complete · ${result.correct}/${result.total} correct (${result.percent??0}%) · ${result.wrong||0} wrong. A question missed once stays wrong for this exam even if its retry is correct. Use Mistakes only to review remaining weak items.`;}
  }
  function exportProgress(){const exported=copy(state);delete exported.activeSession;delete exported.sessionStoreVersion;delete exported.revision;const blob=new Blob([JSON.stringify({app:'LifeUK',schemaVersion:SCHEMA_VERSION,state:exported},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='lifeuk-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function importProgress(ev){const file=ev.target.files?.[0];ev.target.value='';if(!file)return;try{const x=JSON.parse(await file.text());if(x.app!=='LifeUK'||x.schemaVersion!==SCHEMA_VERSION||!validState(x.state))throw new Error();if(!confirm('Replace progress on this device with the imported LifeUK progress?'))return;state={...blankState(),...x.state,lastExams:object(x.state.lastExams)?x.state.lastExams:{}};session=null;current=null;checked=false;save();showHome();notify('Progress imported. No active session was imported.');}catch{notify('This progress file is not compatible. Your existing progress has not been replaced.');}}
  function resetProgress(){if(!confirm('Reset all LifeUK progress on this device?'))return;state=blankState();session=null;current=null;checked=false;save();showHome();$('sessionResult').classList.add('hidden');notify('Progress reset.');}
  init().catch(err=>{notify('Unable to load LifeUK: '+err.message);});
})();
