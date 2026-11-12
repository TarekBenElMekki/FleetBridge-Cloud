/* Bounded, user-started Google discovery. Never requests or interacts with LinkedIn. */
importScripts('experience_metrics.js','core.js','db.js','google_capture.js','batch_plan.js');
const RUN_KEY='fleetbridgeDiscoveryRun',ALARM='fleetbridgeDiscoveryNext';
const WAIT_MS=30000;
async function readRun(){return (await chrome.storage.local.get(RUN_KEY))[RUN_KEY]||null;}
async function writeRun(run){const saved={...run,updatedAt:Date.now()};await chrome.storage.local.set({[RUN_KEY]:saved});return saved;}
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
function sameGooglePage(a,b){
  try{
    const left=new URL(a),right=new URL(b);
    return left.origin===right.origin&&left.pathname==='/search'&&right.pathname==='/search'&&
      left.searchParams.get('q')===right.searchParams.get('q')&&
      Number(left.searchParams.get('start')||0)===Number(right.searchParams.get('start')||0);
  }catch(_){return false;}
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
let activeProcessing=null;
async function processRun(){
  if(activeProcessing)return activeProcessing;
  const task=(async()=>{
    let run=await readRun();
    if(!run||run.status!=='running')return run;
    try{
      const before=run;
      run=await writeRun({...run,phase:'capturing'});
      const {data}=await readGoogleTab(run.tabId);
      if(before.query&&before.query!==data.query)throw new Error('The Google search query changed; stopped.');
      if(before.phase==='loading'&&before.nextUrl&&!sameGooglePage(data.pageUrl,before.nextUrl))
        throw new Error('The Google tab did not open the expected Next page; stopped.');

      const picked=FBBatch.select(data.rows,run.seenUrls||[],run.targetLinks||0,FB.canonicalUrl);
      const totals=await FBDB.captureGoogle(picked.rows,data.query);
      const latest=await readRun();
      if(!latest)return null;
      run={...latest,query:data.query,pagesDone:(latest.pagesDone||0)+1,
        added:(latest.added||0)+totals.added,existing:(latest.existing||0)+totals.existing,
        cards:(latest.cards||0)+data.rows.length,seenUrls:picked.seenUrls,
        duplicateLinks:(latest.duplicateLinks||0)+picked.duplicates,
        nonProfileLinks:(latest.nonProfileLinks||0)+picked.invalid,
        emptyPages:picked.uniqueAdded?0:(latest.emptyPages||0)+1,
        lastPageUrl:data.pageUrl};
      // Stop may have been pressed while Chrome was extracting this one page.
      // Finish accounting for already saved links without restarting navigation.
      if(latest.status!=='running')return writeRun({...run,phase:'finished',nextAt:null});

      const next=safeNext(data.pageUrl,data.nextUrl,data.query);
      const reachedTarget=run.targetLinks>0&&picked.seenUrls.length>=run.targetLinks;
      const reachedCap=run.pagesDone>=run.maxPages;
      const stalled=run.emptyPages>=3;
      if(reachedTarget||reachedCap||!next||stalled){
        const reason=reachedTarget?`Target reached: ${run.targetLinks} distinct LinkedIn links.`:
          !next?'No further verified Google Next link; available results exhausted.':
          stalled?'Three consecutive pages produced no new distinct LinkedIn links.':
          `Safety cap reached after ${run.maxPages} pages; fewer than ${run.targetLinks||'the requested number of'} links may be available.`;
        return writeRun({...run,status:'complete',phase:'finished',nextAt:null,nextUrl:'',pauseRequested:false,reason});
      }
      if(run.pauseRequested){
        return writeRun({...run,status:'paused',phase:'paused',pauseRequested:false,
          nextUrl:next,nextAt:null,reason:'Paused after safely saving the current Google page.'});
      }
      run=await writeRun({...run,phase:'waiting',nextUrl:next,nextAt:Date.now()+WAIT_MS});
      await chrome.alarms.create(ALARM,{when:run.nextAt});
      return run;
    }catch(error){return stopRun(error.message||'Google collection stopped unexpectedly.');}
  })();
  activeProcessing=task;
  try{return await task;}finally{if(activeProcessing===task)activeProcessing=null;}
}
async function pauseRun(){
  const run=await readRun();
  if(run?.status!=='running')throw new Error('No running collection to pause.');
  if(run.pauseRequested)return run;
  if(run.phase==='waiting'){
    await chrome.alarms.clear(ALARM);
    return writeRun({...run,status:'paused',phase:'paused',nextAt:null,
      reason:'Paused. The next Google page has not been opened.'});
  }
  return writeRun({...run,pauseRequested:true,reason:'Pause requested; finishing the current page.'});
}
async function resumeRun(){
  const run=await readRun();
  if(run?.status!=='paused')throw new Error('No paused collection to resume.');
  const tab=await chrome.tabs.get(run.tabId);
  if(!/^https:\/\/www\.google\.com\/search(?:\?|$)/i.test(tab?.url||''))
    throw new Error('Return to the original Google Search tab before resuming.');
  if(run.pagesDone===0||!run.nextUrl){
    await writeRun({...run,status:'running',phase:'capturing',reason:'',pauseRequested:false});
    return processRun();
  }
  if(sameGooglePage(tab.url,run.nextUrl)){
    await writeRun({...run,status:'running',phase:'loading',reason:'',pauseRequested:false});
    return processRun();
  }
  if(!sameGooglePage(tab.url,run.lastPageUrl))
    throw new Error('Search tab no longer matches the saved batch. Restore the original page to resume.');
  const resumed=await writeRun({...run,status:'running',phase:'waiting',pauseRequested:false,
    reason:'',nextAt:Date.now()+WAIT_MS});
  await chrome.alarms.create(ALARM,{when:resumed.nextAt});
  return resumed;
}
async function recoverInterruptedRun(){
  const run=await readRun();
  if(run?.status==='running'&&['capturing','loading'].includes(run.phase)&&
    Date.now()-(run.updatedAt||0)>120000&&!activeProcessing){
    await chrome.alarms.clear(ALARM);
    return writeRun({...run,status:'paused',phase:'paused',pauseRequested:false,nextAt:null,
      reason:'Collection was interrupted. Resume to continue from the saved batch checkpoint.'});
  }
  return run;
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if(message?.type==='GET_RUN'){
      const rows=await FBDB.all();
      return {run:await recoverInterruptedRun(),stats:{total:rows.length,enriched:rows.filter(row=>row.profileImport?.importedAt).length}};
    }
    if(message?.type==='STOP_RUN')return {run:await stopRun()};
    if(message?.type==='PAUSE_RUN')return {run:await pauseRun()};
    if(message?.type==='RESUME_RUN')return {run:await resumeRun()};
    if(message?.type==='CAPTURE_PAGE'){
      const run=await readRun();if(run?.status==='running')throw new Error('Stop the current collection run before capturing separately.');
      return {capture:await capturePage(message.tabId)};
    }
    if(message?.type==='START_RUN'){
      const previous=await readRun();if(previous?.status==='running')throw new Error('A collection run is already active.');
      if(previous?.status==='paused')throw new Error('Resume or stop the paused batch before starting another.');
      const {mode,targetLinks,maxPages}=FBBatch.options(message);
      await writeRun({tabId:message.tabId,mode,targetLinks,maxPages,pagesDone:0,added:0,existing:0,cards:0,
        seenUrls:[],duplicateLinks:0,nonProfileLinks:0,emptyPages:0,pauseRequested:false,
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
