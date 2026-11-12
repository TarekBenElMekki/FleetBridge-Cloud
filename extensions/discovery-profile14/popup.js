'use strict';
const $=id=>document.getElementById(id);
function notify(message,error=false){$('message').textContent=message;$('message').classList.toggle('error',error);}
async function api(type,extra={}){
  const response=await chrome.runtime.sendMessage({type,...extra});
  if(!response?.ok)throw new Error(response?.error||'Extension action failed.');return response;
}
async function activeGoogle(){
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!/^https:\/\/www\.google\.com\/search(?:\?|$)/.test(tab?.url||''))throw new Error('Select your Google Search results tab first.');
  return tab;
}
async function refresh(){
  try{
    const {run,stats}=await api('GET_RUN');
    $('stats').textContent=`${stats.total} links · ${stats.enriched} reviewed`+
      (run?` · Batch: ${(run.seenUrls||[]).length}${run.targetLinks?`/${run.targetLinks}`:''} distinct · +${run.added} new / ${run.existing} existing`:'');
    if(run){
      const progress=`${run.pagesDone}/${run.maxPages} pages · ${run.duplicateLinks||0} repeated links · `+
        `${(run.seenUrls||[]).length} distinct${run.targetLinks?` / ${run.targetLinks} target`:''}`;
      const state=run.reason|| (run.phase==='waiting'?'Waiting 30 seconds before the next Google page…':
        run.phase==='loading'?'Opening the next Google results page…':'Capturing visible Google results…');
      notify(`${run.status.toUpperCase()} · ${progress}. ${state}`);
    }
    const active=run?.status==='running',paused=run?.status==='paused';
    $('stop').disabled=!active&&!paused;
    $('pause').disabled=!active||Boolean(run?.pauseRequested);
    $('resume').disabled=!paused;
    $('start').disabled=active||paused;
    $('capturePage').disabled=active||paused;
  }catch(error){notify(error.message,true);}
}
async function run(callback){
  try{await callback();await refresh();}catch(error){notify(error.message,true);}
}
$('capturePage').addEventListener('click',()=>run(async()=>{
  const tab=await activeGoogle();const {capture}=await api('CAPTURE_PAGE',{tabId:tab.id});
  notify(`Captured ${capture.added} new and ${capture.existing} existing profiles (${capture.cards} cards).`);
}));
$('start').addEventListener('click',()=>run(async()=>{
  const tab=await activeGoogle(),choice=$('pages').value;
  await api('START_RUN',choice==='links250'?{tabId:tab.id,mode:'links250'}:
    {tabId:tab.id,maxPages:Number(choice.replace('pages',''))});
}));
$('pause').addEventListener('click',()=>run(()=>api('PAUSE_RUN')));
$('resume').addEventListener('click',()=>run(()=>api('RESUME_RUN')));
$('stop').addEventListener('click',()=>run(()=>api('STOP_RUN')));
$('review').addEventListener('click',async()=>{
  try{const win=await chrome.windows.getCurrent();await chrome.sidePanel.open({windowId:win.id});window.close();}
  catch(error){notify(`Unable to open sidebar: ${error.message}`,true);}
});
$('dashboard').addEventListener('click',()=>chrome.runtime.openOptionsPage());
refresh();const handle=setInterval(refresh,2500);window.addEventListener('unload',()=>clearInterval(handle));
