/* Bounded, user-started Google discovery. Never requests or interacts with LinkedIn. */
importScripts('experience_metrics.js','core.js','db.js','google_capture.js');
const RUN_KEY='fleetbridgeDiscoveryRun',ALARM='fleetbridgeDiscoveryNext';
const WAIT_MS=30000;
async function readRun(){return (await chrome.storage.local.get(RUN_KEY))[RUN_KEY]||null;}
async function writeRun(run){await chrome.storage.local.set({[RUN_KEY]:run});return run;}
async function stopRun(reason='Stopped by user.'){
  await chrome.alarms.clear(ALARM);
  const prior=await readRun();if(!prior)return null;
  return writeRun({...prior,status:'stopped',phase:'finished',nextAt:null,reason});
}
function safeNext(current,next,query){
  try{
    const a=new URL(current),b=new URL(next);
    if(b.origin!==a.origin||b.pathname!=='/search'||b.searchParams.get('q')!==query)return '';
    if(Number(b.searchParams.get('start')||0)<=Number(a.searchParams.get('start')||0))return '';
    return b.href;
  }catch(_){return '';}
}
async function readGoogleTab(tabId){
  const tab=await chrome.tabs.get(tabId);
  if(!tab?.url||!/^https:\/\/www\.google\.com\/search(?:\?|$)/i.test(tab.url))throw new Error('The search tab left Google Search; stopped.');
  const result=await chrome.scripting.executeScript({target:{tabId},func:fleetbridgeExtractGoogleResults});
  const data=result?.[0]?.result;
  if(!data||data.error)throw new Error(data?.error||'Unable to capture visible Google results.');
  return {data,tab};
}
async function capturePage(tabId){
  const {data}=await readGoogleTab(tabId);
  const profiles=data.rows.filter(row=>FB.canonicalUrl(row.url));
  const totals=await FBDB.captureGoogle(profiles,data.query);
  return {...totals,cards:data.rows.length,profiles:profiles.length,query:data.query,pageUrl:data.pageUrl,nextUrl:data.nextUrl};
}
async function processRun(){
  let run=await readRun();
  if(!run||run.status!=='running')return run;
  try{
    await writeRun({...run,phase:'capturing'});
    const result=await capturePage(run.tabId);
    if((await readRun())?.status!=='running')return readRun();
    if(run.query&&run.query!==result.query)throw new Error('The Google search query changed; stopped.');
    run={...run,query:result.query,pagesDone:run.pagesDone+1,
      added:run.added+result.added,existing:run.existing+result.existing,cards:run.cards+result.cards,
      lastPageUrl:result.pageUrl};
    const next=safeNext(result.pageUrl,result.nextUrl,result.query);
    if(run.pagesDone>=run.maxPages||!next){
      return writeRun({...run,status:'complete',phase:'finished',nextAt:null,nextUrl:'',
        reason:!next?'No further verified Next link on the visible Google page.':'Selected page limit reached.'});
    }
    run={...run,phase:'waiting',nextUrl:next,nextAt:Date.now()+WAIT_MS};
    await writeRun(run);
    await chrome.alarms.create(ALARM,{when:run.nextAt});
    return run;
  }catch(error){return stopRun(error.message||'Google collection stopped unexpectedly.');}
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if(message?.type==='GET_RUN'){
      const rows=await FBDB.all();
      return {run:await readRun(),stats:{total:rows.length,enriched:rows.filter(row=>row.profileImport?.importedAt).length}};
    }
    if(message?.type==='STOP_RUN')return {run:await stopRun()};
    if(message?.type==='CAPTURE_PAGE'){
      const run=await readRun();if(run?.status==='running')throw new Error('Stop the current collection run before capturing separately.');
      return {capture:await capturePage(message.tabId)};
    }
    if(message?.type==='START_RUN'){
      const previous=await readRun();if(previous?.status==='running')throw new Error('A collection run is already active.');
      const maxPages=Number(message.maxPages);
      if(![5,10,20].includes(maxPages))throw new Error('Choose 5, 10 or 20 pages.');
      await writeRun({tabId:message.tabId,maxPages,pagesDone:0,added:0,existing:0,cards:0,
        query:'',lastPageUrl:'',nextUrl:'',nextAt:null,status:'running',phase:'capturing',reason:''});
      return {run:await processRun()};
    }
    throw new Error('Unknown extension action.');
  })().then(value=>respond({ok:true,...value}),error=>respond({ok:false,error:error.message||'Unknown error.'}));
  return true;
});
chrome.alarms.onAlarm.addListener(async alarm=>{
  if(alarm.name!==ALARM)return;
  const run=await readRun();if(run?.status!=='running'||run.phase!=='waiting'||!run.nextUrl)return;
  try{
    const tab=await chrome.tabs.get(run.tabId);
    if(!tab?.url||!/^https:\/\/www\.google\.com\/search(?:\?|$)/i.test(tab.url))throw new Error('The original Google tab changed; stopped.');
    if(run.lastPageUrl){
      const old=new URL(run.lastPageUrl),now=new URL(tab.url);
      if(old.searchParams.get('q')!==now.searchParams.get('q')||
        Number(old.searchParams.get('start')||0)!==Number(now.searchParams.get('start')||0))
        throw new Error('You navigated the Google search tab manually; collection stopped.');
    }
    await writeRun({...run,phase:'loading'});
    await chrome.tabs.update(run.tabId,{url:run.nextUrl});
  }catch(error){await stopRun(error.message||'Google tab navigation failed.');}
});
chrome.tabs.onUpdated.addListener((tabId,change)=>{
  if(change.status!=='complete')return;
  void (async()=>{const run=await readRun();if(run?.status==='running'&&run.phase==='loading'&&run.tabId===tabId)await processRun();})();
});
chrome.tabs.onRemoved.addListener(tabId=>{
  void (async()=>{const run=await readRun();if(run?.status==='running'&&run.tabId===tabId)await stopRun('The collection tab was closed.');})();
});
