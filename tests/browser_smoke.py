"""Real DOM regression. CI uses routed HTTP and browser localStorage; local offline mode isolates data."""
import json, os, pathlib, shutil, mimetypes, re
from urllib.parse import urlsplit, unquote
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=pathlib.Path(os.environ.get('QA_OUTPUT',str(ROOT/'qa-output')));OUT.mkdir(parents=True,exist_ok=True)
URL='https://fyam8.github.io/LifeUK/'
ROUND=int(os.environ.get('QA_ROUND','1'));OFFLINE=os.environ.get('QA_OFFLINE')=='1'
DATA={q['id']:q for f in sorted((ROOT/'data').glob('life_in_the_uk_exam*.json')) for q in json.loads(f.read_text())['questions']}
EXAMS={'data/'+f.name:json.loads(f.read_text()) for f in (ROOT/'data').glob('life_in_the_uk_exam*.json')}
HTML=re.sub(r'<script[^>]*>.*?</script>','',(ROOT/'index.html').read_text(),flags=re.S)
def open_page(page):
    if OFFLINE:
        page.set_content(HTML);page.add_script_tag(content=(ROOT/'session-core.js').read_text());page.add_script_tag(content=(ROOT/'app.js').read_text())
    else:page.goto(URL)
    page.wait_for_selector('.exam-card')
def seed(page,progress=None,qs=None,mode='exam',legacy=False):
    page.evaluate('''({progress,qs,mode,legacy})=>{
      const stats={answered:0,correct:0};for(const s of Object.values(progress)){stats.answered+=s.seen||0;stats.correct+=s.correct||0;}
      const state={schemaVersion:1,stats,questions:progress,lastExams:{},updatedAt:Date.now()};
      if(!legacy){state.sessionStoreVersion=1;state.activeSession=qs?LifeUKSession.createSession(mode,'Test session',qs,Date.now()):null;}
      localStorage.setItem('lifeuk_state_v1',JSON.stringify(state));localStorage.removeItem('lifeuk_active_session_v1');
    }''',{'progress':progress or {},'qs':qs,'mode':mode,'legacy':legacy})
    open_page(page)
def answer_current(page,wrong=False):
    return page.evaluate('''({data,wrong})=>{
      const s=JSON.parse(localStorage.getItem('lifeuk_state_v1')).activeSession,q=data[s.queue[s.index]],selected=[...q.correct_option_ids];
      if(wrong)selected[0]=q.options.find(o=>!selected.includes(o.id)).id;
      for(const id of selected)document.querySelector(`.option[data-id="${id}"]`).click();
      document.getElementById('checkBtn').click();return q.id;
    }''',{'data':DATA,'wrong':wrong})
def point_check(page,width,height,button='checkBtn'):
    box=page.locator('#'+button).bounding_box();assert box
    assert box['x']>width/2 and box['x']+box['width']<=width,box
    assert 0<=height-box['y']-box['height']<=40,box
    assert box['height']>=48,box
    return box
with sync_playwright() as p:
    executable=shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,**({'executable_path':executable} if executable else {}),args=['--no-sandbox'])
    results=[]
    for label,width,height,mobile in [('desktop',1440,900,False),('mobile',390,844,True)]:
        context=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,accept_downloads=True)
        def serve(route):
            relative=unquote(urlsplit(route.request.url).path).removeprefix('/LifeUK/') or 'index.html';target=(ROOT/relative).resolve()
            if not target.is_relative_to(ROOT) or not target.is_file():route.fulfill(status=404,body='Not found');return
            route.fulfill(status=200,body=target.read_bytes(),content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        context.route('https://fyam8.github.io/LifeUK/**',serve)
        page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.add_init_script('window.confirm=()=>true;window.alert=()=>{};')
        if OFFLINE:page.evaluate('''exams=>{window.confirm=()=>true;window.alert=()=>{};const data={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>data[k]??null,setItem:(k,v)=>{data[k]=String(v)},removeItem:k=>{delete data[k]}}});window.fetch=async path=>({ok:!!exams[path],json:async()=>exams[path]});}''',EXAMS)
        open_page(page);assert page.locator('.exam-card').count()==17
        if mobile:
            cols=page.evaluate("getComputedStyle(document.querySelector('#examGrid')).gridTemplateColumns.split(' ').length")
            assert cols==2 if width>340 else cols==1
            assert page.locator('.exam-card').nth(0).bounding_box()['height'] < 170
        assert '408 questions' in page.locator('#examSummary').inner_text()
        assert '24 questions' in page.locator('.exam-card').last.inner_text()
        assert page.locator('.exam-accuracy').first.inner_text()=='Latest accuracy: —'
        assert page.locator('#mistakesBtn').is_disabled()
        bulk=page.evaluate('''({data,wrong})=>{
          const S='lifeuk_state_v1',attemptCounts=[];
          for(let exam=0;exam<17;exam++){
            document.querySelectorAll('.exam-btn')[exam].click();const seen=new Map();let attempts=0;
            while(JSON.parse(localStorage.getItem(S)).activeSession){
              let state=JSON.parse(localStorage.getItem(S)),s=state.activeSession,id=s.queue[s.index],q=data[id];
              seen.set(id,(seen.get(id)||0)+1);if(seen.get(id)>2)throw Error('More than one retry');
              const given=[...q.correct_option_ids];if(wrong)given[0]=q.options.find(o=>!given.includes(o.id)).id;
              for(const x of given)document.querySelector(`.option[data-id="${x}"]`).click();
              const before=state.stats.answered;document.getElementById('checkBtn').click();document.getElementById('checkBtn').click();
              state=JSON.parse(localStorage.getItem(S));s=state.activeSession;
              if(state.stats.answered!==before+1||LifeUKSession.answerAt(s,s.index).ok===wrong)throw Error('Grading/retry error');
              attempts++;document.getElementById('nextBtn').click();document.getElementById('nextBtn').click();
              if(attempts>48)throw Error('Retry queue did not terminate');
            }
            if(seen.size!==24)throw Error('Not all source questions seen');
            const state=JSON.parse(localStorage.getItem(S)),id='exam'+String(exam+1).padStart(2,'0'),expectedAttempts=wrong?48:24;
            if(attempts!==expectedAttempts||state.lastExams[id].answered!==24||state.lastExams[id].wrong!==(wrong?24:0)||state.lastExams[id].correct!==(wrong?0:24)||state.lastExams[id].percent!==(wrong?0:100))throw Error('Bad completed exam');
            const card=document.querySelectorAll('.exam-card')[exam];if(!card.querySelector('.exam-accuracy').textContent.endsWith((wrong?'0':'100')+'%'))throw Error('Wrong latest accuracy');
            attemptCounts.push(attempts);
          }
          return {exams:attemptCounts.length,attempts:attemptCounts.reduce((a,b)=>a+b,0),all_wrong:wrong};
        }''',{'data':DATA,'wrong':ROUND==1})
        assert bulk['attempts']==(816 if ROUND==1 else 408)
        # Correct / wrong feedback, drafts and statistics across Home/Save/Resume/reload.
        qs=[DATA['lituk-exam06-q06'],DATA['lituk-exam06-q07']];seed(page,qs=qs)
        page.click('#resumeBtn');assert 'Select 3 answers' in page.locator('#multiHint').inner_text()
        if mobile:point_check(page,width,height)
        page.click('.option[data-id="a"]');assert page.locator('#checkBtn').is_disabled()
        page.click('#exitBtn');open_page(page);page.click('#resumeBtn');assert page.locator('.option.selected').count()==1
        page.click('.option[data-id="c"]');page.click('.option[data-id="d"]');page.click('#checkBtn')
        if mobile:point_check(page,width,height,'nextBtn')
        for _ in range(2):
            open_page(page);page.click('#resumeBtn');assert page.locator('#checkBtn').is_hidden();assert page.locator('#feedback b').inner_text()=='Correct'
            assert page.evaluate("JSON.parse(localStorage.getItem('lifeuk_state_v1')).stats.answered")==1
        page.click('#nextBtn');page.click('.option[data-id="a"]');page.click('#checkBtn');page.click('#homeBtn');page.click('#resumeBtn')
        assert page.locator('#feedback b').inner_text()=='Not quite';page.click('#nextBtn');assert not page.locator('#resumeBtn').is_disabled()
        assert page.locator('#questionText').inner_text()==qs[1]['question'];answer_current(page);page.click('#nextBtn');assert page.locator('#resumeBtn').is_disabled()
        assert page.locator('[data-exam-id="exam06"] .exam-accuracy').inner_text()=='50%'
        assert '1/2 correct · 1 wrong' in page.locator('[data-exam-id="exam06"]').inner_text()
        # Latest accuracy excludes unseen; only last-wrong records enter either wrong-only scope.
        def st(ok,t=100):return {'seen':2,'correct':1 if ok else 0,'wrong':1 if ok else 2,'streak':1 if ok else 0,'mastered':False,'lastSeen':t,'nextDue':0,'lastCorrect':ok}
        a,b,c='lituk-exam05-q01','lituk-exam05-q02','lituk-exam06-q06'
        seed(page,{a:st(False),b:st(True),c:st(False,200)})
        assert page.locator('[data-exam-id="exam05"] .exam-accuracy').inner_text()=='50%'
        assert '(2)' in page.locator('#mistakesBtn').inner_text()
        page.click('[data-exam-id="exam05"] .mistakes-exam-btn')
        s=page.evaluate("JSON.parse(localStorage.getItem('lifeuk_state_v1')).activeSession");assert s['queue']==[a] and s['mode']=='mistakes'
        answer_current(page);page.click('#nextBtn')
        assert page.locator('[data-exam-id="exam05"] .exam-accuracy').inner_text()=='100%'
        assert page.locator('[data-exam-id="exam05"] .mistakes-exam-btn').is_disabled()
        assert 'not recorded' in page.locator('[data-exam-id="exam05"] .last-exam').inner_text()
        page.click('#mistakesBtn');s=page.evaluate("JSON.parse(localStorage.getItem('lifeuk_state_v1')).activeSession");assert s['queue']==[c]
        answer_current(page,True);open_page(page);page.click('#resumeBtn');assert page.locator('#checkBtn').is_hidden();page.click('#nextBtn')
        assert '(1)' in page.locator('#mistakesBtn').inner_text();page.click('#mistakesBtn');answer_current(page);page.click('#nextBtn');assert page.locator('#mistakesBtn').is_disabled()
        # Legacy queue cleanup and legacy recent-answer reconstruction preserve Q23 history.
        seed(page,{a:st(False,100),'lituk-exam17-q23':{'seen':7,'correct':6,'wrong':1,'streak':2,'mastered':False,'lastSeen':1,'nextDue':2}},legacy=True)
        page.evaluate('''({a,b,c})=>{const s=JSON.parse(localStorage.getItem('lifeuk_state_v1'));delete s.sessionStoreVersion;delete s.activeSession;localStorage.setItem('lifeuk_state_v1',JSON.stringify(s));localStorage.setItem('lifeuk_active_session_v1',JSON.stringify({mode:'exam',label:'Legacy',queue:[a,b,a,c],index:2,startedAt:50}));}''',{'a':a,'b':b,'c':'lituk-exam05-q03'})
        open_page(page);page.click('#resumeBtn');assert 'Source Q3' in page.locator('#counter').inner_text();page.click('#exitBtn')
        assert page.locator('[data-exam-id="exam17"] .exam-accuracy').inner_text()=='Latest accuracy: 100%'
        # Export / Reset / Import including old-format progress and new per-exam data.
        with page.expect_download() as info:page.click('#exportBtn')
        backup=OUT/f'{label}-round{ROUND}-progress.json';info.value.save_as(backup);exported=json.loads(backup.read_text())
        assert exported['state']['questions']['lituk-exam17-q23']['seen']==7 and 'activeSession' not in exported['state']
        page.click('#resetBtn');assert page.locator('#mAnswered').inner_text()=='0';page.locator('#importInput').set_input_files(backup)
        page.wait_for_function("document.getElementById('notice').textContent.startsWith('Progress imported')")
        restored=page.evaluate("JSON.parse(localStorage.getItem('lifeuk_state_v1'))");assert restored['stats']==exported['state']['stats'];assert restored['questions']==exported['state']['questions'];assert page.locator('#resumeBtn').is_disabled()
        page.screenshot(path=str(OUT/f'{label}-home-round{ROUND}.png'),full_page=True)
        # Long mobile question/feedback: Check and Next stay in the same bottom-right slot.
        seed(page,qs=[DATA['lituk-exam10-q18'],DATA['lituk-exam10-q19']]);page.click('#resumeBtn')
        if mobile:
            boxes=[]
            for w,h in [(390,844),(320,568),(844,390)]:
                page.set_viewport_size({'width':w,'height':h});page.evaluate('scrollTo(0,document.body.scrollHeight)');boxes.append(point_check(page,w,h))
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.set_viewport_size({'width':width,'height':height});page.evaluate('scrollTo(0,0)');check_box=point_check(page,width,height)
        answer_current(page)
        if mobile:
            next_box=point_check(page,width,height,'nextBtn');assert abs(next_box['x']-check_box['x'])<1 and abs(next_box['y']-check_box['y'])<1
            page.screenshot(path=str(OUT/f'{label}-controls-round{ROUND}.png'),full_page=False)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors
        results.append({'viewport':label,'width':width,**bulk,'latest_accuracy':'PASS','last_exam':'PASS','mistakes_only_by_exam_and_all':'PASS','correct_retry_removes_error':'PASS','reload_no_double_grade':'PASS','legacy_migration':'PASS','export_import':'PASS','mobile_bottom_right':'PASS' if mobile else 'not applicable','errors':errors})
        context.close()
    browser.close()
report={'round':ROUND,'transport':'offline synthetic storage/fetch' if OFFLINE else 'routed HTTP with real browser storage','results':results}
print(json.dumps(report,indent=2));(OUT/f'browser-round{ROUND}.json').write_text(json.dumps(report,indent=2)+'\n')
