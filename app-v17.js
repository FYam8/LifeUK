/* Compatibility entrypoint for previously cached HTML. */
(() => {
  const version='20261004-exam17-24';
  function load(src,next){const s=document.createElement('script');s.src=src+'?v='+version;s.onload=next;s.onerror=()=>{document.body.textContent='Unable to load LifeUK. Please reload the page.';};document.head.appendChild(s);}
  // Cached HTML must upgrade as a unit; it lacks the new controls.
  if(!document.getElementById('mistakesBtn')){const u=new URL(location.href);if(u.searchParams.get('v')!==version){u.searchParams.set('v',version);location.replace(u.href);}else{document.body.textContent='LifeUK is updating. Please reload this page.';}return;}
  load('session-core.js',()=>load('app.js',()=>{}));
})();
