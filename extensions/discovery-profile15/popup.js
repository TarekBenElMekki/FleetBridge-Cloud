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
    $('stats').textContent=`${stats.total} profiles in local database (${stats.enriched} enriched). `+
      (run?`${run.pagesDone}/${run.maxPages} pages · ${run.added} new · ${run.existing} existing · ${run.cards} Google cards`:'No collection in progress.');
    if(run){notify(`${run.status.toUpperCase()}: ${run.reason|| (run.phase==='waiting'?'Waiting before opening the next Google page…':'Capturing visible Google results…')}`);}
    $('stop').disabled=run?.status!=='running';$('start').disabled=run?.status==='running';$('capturePage').disabled=run?.status==='running';
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
  const tab=await activeGoogle();await api('START_RUN',{tabId:tab.id,maxPages:Number($('pages').value)});
}));
$('stop').addEventListener('click',()=>run(()=>api('STOP_RUN')));
$('review').addEventListener('click',async()=>{
  try{const win=await chrome.windows.getCurrent();await chrome.sidePanel.open({windowId:win.id});window.close();}
  catch(error){notify(`Unable to open sidebar: ${error.message}`,true);}
});
$('dashboard').addEventListener('click',()=>chrome.runtime.openOptionsPage());
refresh();const handle=setInterval(refresh,2500);window.addEventListener('unload',()=>clearInterval(handle));
