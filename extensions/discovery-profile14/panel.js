'use strict';
const $=id=>document.getElementById(id);
const QUEUE_KEY='fleetbridgeReviewQueueV1',SELECT_KEY='fleetbridgeDashboardSelectionV1';
let queue={urls:[],index:0},rows=new Map(),profileTabId=null;
const currentKey=()=>queue.urls[queue.index]||'';
const current=()=>rows.get(currentKey());
function show(message,error=false){$('captureStatus').textContent=message;$('captureStatus').classList.toggle('error',error);}
function error(message){$('panelError').textContent=message;$('panelError').classList.toggle('hidden',!message);}
async function fetchRows(){rows=new Map((await FBDB.all()).map(r=>[FB.canonicalUrl(r.url),r]));}
async function saveQueue(){await chrome.storage.local.set({[QUEUE_KEY]:queue});}
function render(){
  const row=current(),has=Boolean(row),cap=row?.profileCapture,imported=row?.profileImport;
  $('progress').textContent=has?`${queue.index+1} / ${queue.urls.length} candidates`:`${rows.size} stored · no candidate selected`;
  $('candidateTitle').textContent=has?(cap?.fields?.name||imported?.name||row.title||row.url):'No pending candidates';
  $('candidateSnippet').textContent=has?(cap?.fields?.headline||row.snippet||row.url):'Collect Google results or choose a candidate in Workspace.';
  if(cap){
    const jobs=cap.roles?.length||0,placeCount=cap.roles?.filter(r=>r.locationRaw).length||0;
    $('result').textContent=`Captured · ${jobs} jobs · ${placeCount} job locations · ready for review`;
  }else if(imported?.importedAt){
    const summary=imported.experienceSummary||FB.summarizeExperience(imported.experience);
    $('result').textContent=`Reviewed · ${summary.totalDuration||'Experience unverified'} · ${summary.latestCompany||'Employer unknown'}`;
  }else $('result').textContent='Not captured yet';
  for(const id of ['openProfile','capture','captureFull','next','review'])$(id).disabled=!has;
  $('saveNext').disabled=!cap;
  $('previous').disabled=queue.index<=0;
}
async function initialize(){
  try{
    await fetchRows();const saved=(await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY];
    const candidates=Array.isArray(saved?.urls)?saved.urls.map(FB.canonicalUrl).filter(url=>rows.has(url)):[];
    queue=candidates.length?{urls:candidates,index:Math.min(Math.max(0,Number(saved.index)||0),candidates.length)}:
      {urls:FB.pending([...rows.values()]),index:0};
    render();
  }catch(e){error(`Unable to load local candidates: ${e.message}`);}
}
async function rebuild(){
  try{await fetchRows();queue={urls:FB.pending([...rows.values()]),index:0};await saveQueue();render();show('Showing pending candidates.');}
  catch(e){show(e.message,true);}
}
async function move(delta){
  queue.index=Math.max(0,Math.min(queue.urls.length,queue.index+delta));
  try{await saveQueue();render();show('Ready.');}catch(e){show(e.message,true);}
}
async function saveAndOpenNext(){
  const row=current();
  if(!row?.profileCapture){show('Capture the visible profile before saving and moving on.',true);return;}
  try{
    // Each capture is already written to the local database. Marking this queue
    // item as complete must never replace or approve the human review record.
    const updated={...row,discoveryCapturedAt:new Date().toISOString()};
    await FBDB.save(updated);rows.set(currentKey(),updated);
    if(queue.index+1>=queue.urls.length){
      queue.index=queue.urls.length;
      await saveQueue();render();show('All queued profiles captured. Review results in Workspace.');return;
    }
    queue.index+=1;await saveQueue();render();
    await openCurrent();
    show('Capture saved. Next candidate opened for your review.');
  }catch(e){show(`Saved locally, but could not advance: ${e.message}`,true);}
}
async function openCurrent(){
  if(!currentKey())return;
  try{
    if(profileTabId){
      try{await chrome.tabs.get(profileTabId);await chrome.tabs.update(profileTabId,{url:currentKey(),active:true});return;}
      catch(_){profileTabId=null;}
    }
    profileTabId=(await chrome.tabs.create({url:currentKey(),active:true})).id;
  }catch(e){show(e.message,true);}
}
async function capture(kind){
  if(!currentKey())return;
  try{
    const granted=await chrome.permissions.request({origins:['https://*.linkedin.com/*']});
    if(!granted)throw new Error('LinkedIn page permission was declined.');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id||FB.canonicalUrl(tab.url)!==currentKey())
      throw new Error('Open the selected candidate on LinkedIn first.');
    const full=kind==='full_experience';
    const response=await chrome.scripting.executeScript({target:{tabId:tab.id},
      func:full?fleetbridgeExtractFullExperience:fleetbridgeExtractVisibleProfile});
    const result=response?.[0]?.result;
    if(!result?.ok)throw new Error(result?.error||'No visible experience could be read.');
    if(FB.canonicalUrl(result.url)!==currentKey())throw new Error('The browser tab changed during capture.');
    const staged=FB.stageCapture(current(),currentKey(),result,kind);
    await FBDB.save(staged);rows.set(currentKey(),staged);
    render();
    show(`${full?'Full experience':'Profile'} captured locally. Review in Workspace.`);
  }catch(e){show(e.message,true);}
}
async function openWorkspace(){
  try{await chrome.storage.local.set({[SELECT_KEY]:currentKey()});await chrome.runtime.openOptionsPage();}
  catch(e){show(`Unable to open workspace: ${e.message}`,true);}
}
$('dashboard').addEventListener('click',()=>void openWorkspace());
$('review').addEventListener('click',()=>void openWorkspace());
$('openProfile').addEventListener('click',()=>void openCurrent());
$('capture').addEventListener('click',()=>void capture('profile'));
$('captureFull').addEventListener('click',()=>void capture('full_experience'));
$('saveNext').addEventListener('click',()=>void saveAndOpenNext());
$('previous').addEventListener('click',()=>void move(-1));
$('next').addEventListener('click',()=>void move(1));
$('reloadQueue').addEventListener('click',()=>void initialize());
$('rebuild').addEventListener('click',()=>void rebuild());
initialize();
