'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const C=require('../session-core.js'), crypto=require('node:crypto');
const root=path.join(__dirname,'..'), files=fs.readdirSync(path.join(root,'data')).filter(f=>/^life_in_the_uk_exam\d\d\.json$/.test(f)).sort();
const exams=files.map(f=>JSON.parse(fs.readFileSync(path.join(root,'data',f),'utf8')));
const all=exams.flatMap(e=>e.questions), bank=new Map(all.map(q=>[q.id,q]));
const q=id=>bank.get(id), clone=x=>JSON.parse(JSON.stringify(x));
const wrong=q=>{const a=[...q.correct_option_ids];a[0]=q.options.find(o=>!a.includes(o.id)).id;return a};
test('17 exams / 408 source records / 408 unique IDs / unchanged source bytes',()=>{
 assert.equal(exams.length,17);assert.equal(all.length,408);assert.equal(bank.size,408);
 const audit=JSON.parse(fs.readFileSync(path.join(root,'docs/source-audit.json'),'utf8'));
 files.forEach((file,i)=>assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'data',file))).digest('hex'),audit.by_exam[i].source_sha256));
 for(const e of exams){assert.equal(e.question_count,24);assert.equal(e.questions.length,24);for(const x of e.questions){assert.equal(x.required_selection_count,x.correct_option_ids.length);assert.equal(new Set(x.options.map(o=>o.id)).size,x.options.length);assert(x.correct_option_ids.every(id=>x.options.some(o=>o.id===id)));}}
});
for(const e of exams) test(`${e.source.exam_label}: each missed source question retries once and every miss is counted`,()=>{
 const before=JSON.stringify(e), s=C.createSession('exam',e.source.exam_label,[...e.questions,...e.questions],100);
 assert.equal(s.queue.length,24);assert.equal(new Set(s.queue).size,24);assert.equal(new Set(s.queue.map(id=>C.questionKey(q(id)))).size,24);
 while(s.index<s.queue.length){const cur=q(s.queue[s.index]);assert.equal(C.advance(s),false);assert.equal(C.recordAnswer(s,cur,[],110),null);const a=C.recordAnswer(s,cur,wrong(cur),120+s.index);assert(a&&!a.ok);assert.equal(C.recordAnswer(s,cur,wrong(cur),130+s.index),null);assert(C.advance(s));}
 assert.equal(s.queue.length,48);assert.equal(s.attempts.length,48);assert.deepEqual(C.sessionScore(s),{total:24,answered:24,correct:0,wrong:24,percent:0,complete:true});assert.equal(C.restoreSession(s,bank),null);assert.equal(JSON.stringify(e),before);
});
test('single, true/false, two- and three-answer grading: all selection subsets',()=>{
 for(const x of all)for(let mask=0;mask<(1<<x.options.length);mask++){
  const selected=x.options.filter((_,i)=>mask&(1<<i)).map(o=>o.id), s=C.createSession('exam','Check',[x],1), a=C.recordAnswer(s,x,selected,2);
  if(selected.length!==x.required_selection_count)assert.equal(a,null);else{assert(a);assert.equal(a.ok,x.correct_option_ids.every(id=>selected.includes(id)));}
 }
});
test('all 17 exams retain 24 distinct source questions',()=>{
 assert.notEqual(C.questionKey(q('lituk-exam17-q03')),C.questionKey(q('lituk-exam17-q23')));
 assert.notEqual(C.questionKey(q('lituk-exam16-q09')),C.questionKey(q('lituk-exam16-q24')));
 assert.notEqual(C.questionKey(q('lituk-exam17-q08')),C.questionKey(q('lituk-exam17-q11')));
 const keys=exams.map(e=>C.uniqueQuestions(e.questions).length);assert.deepEqual(keys,Array(17).fill(24));assert.equal(keys.reduce((a,b)=>a+b,0),408);
});
test('exact reordered options deduplicate; generic stems with different options do not',()=>{
 const a=q('lituk-exam05-q01'), b={...a,id:'copy',options:[...a.options].reverse()};assert.equal(C.uniqueQuestions([a,b]).length,1);
 b.options=[...b.options.slice(0,-1),{id:'z',text:'Different'}];assert.equal(C.uniqueQuestions([a,b]).length,2);
});
test('correct and incorrect answers survive reload without regrading; draft survives',()=>{
 for(const selected of [q('lituk-exam06-q06').correct_option_ids,wrong(q('lituk-exam06-q06'))]){
  const x=q('lituk-exam06-q06'), s=C.createSession('exam','Exam 6',[x,q('lituk-exam06-q07')],100);
  s.draft={id:x.id,selected:[selected[0]]};let r=C.restoreSession(clone(s),bank);assert.deepEqual(r.draft,s.draft);
  C.recordAnswer(r,x,selected,101);r=C.restoreSession(clone(r),bank);assert.equal(r.index,0);assert.deepEqual(r.answers[x.id].selected,selected);assert.equal(C.recordAnswer(r,x,selected,102),null);assert(C.advance(r));assert.equal(C.advance(r),false);assert.equal(r.index,1);
 }
});
test('legacy retry queue migration: no history mutation or return to answered questions',()=>{
 const [a,b,c]=exams[0].questions, progress={[a.id]:{seen:1,lastSeen:110},[b.id]:{seen:1,lastSeen:120}}, original=clone(progress);
 const raw={mode:'exam',label:'Exam 1',queue:[a.id,b.id,a.id,c.id,b.id],index:2,startedAt:100};
 const r=C.restoreSession(raw,bank,progress,200);assert.deepEqual(r.queue,[a.id,b.id,c.id]);assert.equal(r.index,2);assert.equal(r.queue[r.index],c.id);assert.deepEqual(progress,original);
 const before=C.restoreSession({...raw,index:1},bank,{[b.id]:{seen:3,lastSeen:99}},200);assert.equal(before.queue[before.index],b.id);
});
test('legacy checked last question completes rather than repeating',()=>{
 const x=all[0];assert.equal(C.restoreSession({mode:'exam',queue:[x.id,x.id],index:0,startedAt:100},bank,{[x.id]:{seen:1,lastSeen:101}},200),null);
});
test('unknown IDs and malformed sessions are handled safely',()=>{
 for(const raw of [null,{}, {mode:'exam',queue:[],index:0},{mode:'bad',queue:[all[0].id],index:0},{mode:'exam',queue:[all[0].id],index:-1}])assert.equal(C.restoreSession(raw,bank),null);
 const r=C.restoreSession({mode:'review',queue:['missing',all[0].id],index:0},bank);assert.deepEqual(r.queue,[all[0].id]);
});
test('review sessions also finish after one pass, even if every answer is wrong',()=>{
 const s=C.createSession('review','Review',[all[0],all[0]],100);assert.equal(s.queue.length,1);C.recordAnswer(s,all[0],wrong(all[0]),101);assert.equal(s.queue.length,1);assert(C.advance(s));assert.equal(C.restoreSession(s,bank),null);
});
test('HTML loads the actual validated app with a versioned session core',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert.match(html,/session-core\.js\?v=20261005-random24-1/);assert.match(html,/app\.js\?v=20261005-random24-1/);assert(!html.includes('app-v17.js?v=17'));assert(!fs.readFileSync(path.join(root,'app.js'),'utf8').includes('injectRetry'));
});

const progress=(lastCorrect,lastSeen=100)=>({seen:3,correct:lastCorrect?2:1,wrong:lastCorrect?1:2,streak:lastCorrect?1:0,lastSeen,lastCorrect});
test('latest accuracy uses last answer per question, not lifetime attempts or unseen items',()=>{
 const qs=exams[0].questions, p={[qs[0].id]:progress(true),[qs[1].id]:progress(false),[qs[2].id]:progress(true)};
 assert.deepEqual(C.latestSummary(qs,p),{total:24,answered:3,correct:2,wrong:1,percent:67});
 assert.deepEqual(C.latestSummary(qs,{}),{total:24,answered:0,correct:0,wrong:0,percent:null});
 p[qs[1].id]=progress(true,200);assert.equal(C.latestSummary(qs,p).percent,100);
});
test('legacy streak reconstructs latest outcome only when evidence exists',()=>{
 assert.equal(C.latestResult({seen:5,streak:1,wrong:4}),true);
 assert.equal(C.latestResult({seen:5,streak:0,wrong:1}),false);
 assert.equal(C.latestResult({seen:0,streak:0,wrong:0}),null);
 assert.equal(C.latestResult({seen:4,wrong:1}),null);
 assert.equal(C.latestResult({...progress(false),streak:9}),false);
});
test('mistakes only excludes unseen and latest-correct questions',()=>{
 const qs=exams[4].questions,p={[qs[0].id]:progress(false),[qs[1].id]:progress(true),[qs[2].id]:progress(false,200)};
 assert.deepEqual(C.mistakes(qs,p).map(x=>x.id),[qs[2].id,qs[0].id]);p[qs[0].id]=progress(true,300);
 assert.deepEqual(C.mistakes(qs,p).map(x=>x.id),[qs[2].id]);
});
test('Exam 17 Q3 and Q23 keep independent latest accuracy and mistake state',()=>{
 const qs=exams[16].questions,a='lituk-exam17-q03',b='lituk-exam17-q23',p={[a]:progress(true,10),[b]:progress(false,20)},before=clone(p);
 assert.deepEqual(C.mistakes(qs,p).map(x=>x.id),[b]);assert.equal(C.latestSummary(qs,p).answered,2);assert.equal(C.latestSummary(qs,p).percent,50);assert.deepEqual(p,before);
 p[b]=progress(true,30);assert.equal(C.mistakes(qs,p).length,0);assert.equal(C.latestSummary(qs,p).percent,100);
});
test('wrong-only session survives resume and has a fixed finite queue',()=>{
 const x=exams[0].questions[0],s=C.createSession('mistakes','Mistakes only',[x,x],100);C.recordAnswer(s,x,wrong(x),101);
 const r=C.restoreSession(clone(s),bank);assert.equal(r.mode,'mistakes');assert.equal(r.queue.length,1);assert.equal(C.recordAnswer(r,x,wrong(x),102),null);assert(C.advance(r));assert.equal(C.restoreSession(r,bank),null);
});
test('a question missed once stays wrong for that exam even when its retry is correct',()=>{
 const qs=exams[0].questions.slice(0,2),s=C.createSession('exam','Exam 1',qs,10);assert.equal(C.sessionScore(s).percent,null);
 C.recordAnswer(s,qs[0],qs[0].correct_option_ids,11);assert.equal(C.sessionScore(s).percent,100);assert.equal(C.sessionScore(s).complete,false);C.advance(s);C.recordAnswer(s,qs[1],wrong(qs[1]),12);
 assert.deepEqual(C.sessionScore(s),{total:2,answered:2,correct:1,wrong:1,percent:50,complete:false});assert(C.advance(s));const retry=q(s.queue[s.index]);C.recordAnswer(s,retry,retry.correct_option_ids,13);assert.deepEqual(C.sessionScore(s),{total:2,answered:2,correct:1,wrong:1,percent:50,complete:true});assert.equal(C.sessionScore(C.createSession('exam','Exam 1',qs,14)).answered,0);
});
test('version 2 answer receipts remain graded after the version 3 upgrade',()=>{
 const x=all[0],s=C.createSession('exam','Exam 1',[x,all[1]],1);C.recordAnswer(s,x,x.correct_option_ids,2);s.version=2;
 const r=C.restoreSession(s,bank);assert(r.answers[x.id].ok);assert.equal(C.recordAnswer(r,x,x.correct_option_ids,3),null);
});
