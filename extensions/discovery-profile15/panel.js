'use strict';
const $=id=>document.getElementById(id),QUEUE_KEY='fleetbridgeReviewQueueV1';
let queue={urls:[],index:0}, rows=new Map(),draft=null,profileTabId=null,timerId=null,lastDiagnostics=null;
const longFields=new Set(['headline','experience']);
function stateMessage(message,error=false){$('panelError').textContent=message;$('panelError').classList.toggle('hidden',!message);$('panelError').classList.toggle('error',error);}
function captureMessage(message,error=false){$('captureStatus').textContent=message;$('captureStatus').classList.toggle('error',error);}
function key(){return queue.urls[queue.index]||'';}
function current(){return rows.get(key());}
async function saveQueue(){await chrome.storage.local.set({[QUEUE_KEY]:queue});}
async function fetchRows(){rows=new Map((await FBDB.all()).map(r=>[FB.canonicalUrl(r.url),r]));}
async function buildQueue(){await fetchRows();queue={urls:FB.pending([...rows.values()]),index:0};await saveQueue();draft=null;lastDiagnostics=null;render();}
async function initialize(){
  try{
    await fetchRows();const saved=(await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY];
    if(saved&&Array.isArray(saved.urls)&&saved.urls.length){
      queue={urls:saved.urls.map(FB.canonicalUrl).filter(x=>x&&rows.has(x)),index:Math.max(0,Math.min(Number(saved.index)||0,saved.urls.length))};
      queue.index=Math.min(queue.index,queue.urls.length);
    }else{queue={urls:FB.pending([...rows.values()]),index:0};await saveQueue();}
    render();
  }catch(error){stateMessage(`Unable to open local database: ${error.message}`,true);}
}
function stopTimer(){clearInterval(timerId);timerId=null;}
function startTimer(){
  stopTimer();const end=Date.now()+10000;
  const show=()=>{const remaining=Math.max(0,Math.ceil((end-Date.now())/1000));
    $('timer').textContent=remaining?`Reviewing time: ${remaining}s remaining (visual only).`:'10 seconds elapsed. Take as long as you need; capture only when you click.';
    if(!remaining)stopTimer();};show();timerId=setInterval(show,250);
}
function render(){
  const record=current(),has=Boolean(record);
  $('progress').textContent=has?`Candidate ${queue.index+1} of ${queue.urls.length} · ${[...rows.values()].filter(r=>r.profileImport?.importedAt).length} enriched`:
    `End of queue · ${queue.urls.length} queued links · ${rows.size} database profiles`;
  $('candidateTitle').textContent=has?(record.title||record.profileImport?.name||record.url):'No pending candidate';
  $('candidateSnippet').textContent=has?(record.snippet||record.url):'If Google links exist in your database, click Rebuild pending queue. If the database is empty, restore your JSON backup or capture Google results.';
  for(const id of ['openProfile','next','capture'])$(id).disabled=!has;
  $('previous').disabled=queue.index<=0;
  $('timer').textContent=has?'Open the profile when you are ready.':'No candidate selected.';
  $('review').classList.toggle('hidden',!draft);
  if(draft)displayDraft();
}
async function openCurrent(){
  const url=key();if(!url)return;
  try{
    if(profileTabId){
      try{await chrome.tabs.get(profileTabId);await chrome.tabs.update(profileTabId,{url,active:true});startTimer();return;}
      catch(_){profileTabId=null;}
    }
    const tab=await chrome.tabs.create({url,active:true});profileTabId=tab.id;startTimer();
  }catch(error){stateMessage(`Could not open LinkedIn tab: ${error.message}`,true);}
}
async function move(offset,open=false){
  if(!queue.urls.length)return;
  queue.index=Math.max(0,Math.min(queue.urls.length,queue.index+offset));
  await saveQueue();draft=null;lastDiagnostics=null;stopTimer();stateMessage('');captureMessage('Nothing captured for this candidate yet.');render();
  if(open&&key())await openCurrent();
}
function displayDraft(){
  $('review').classList.remove('hidden');const parent=$('formFields');parent.replaceChildren();
  for(const field of FB.FIELDS){
    const label=document.createElement('label');label.textContent=field.charAt(0).toUpperCase()+field.slice(1);label.htmlFor='field-'+field;
    const input=document.createElement(longFields.has(field)?'textarea':'input');input.id='field-'+field;
    input.value=draft.fields[field]||'';if(longFields.has(field))input.rows=field==='experience'?12:3;
    input.addEventListener('input',()=>{draft.fields[field]=input.value;if(field==='experience')renderExperienceSummary();});parent.append(label,input);
  }
  $('confidence').textContent=`Capture confidence: ${draft.confidence||'unrated'} · Experience ${draft.fields.experience?'detected':'not detected'}`;
  renderExperienceSummary();
}
function renderExperienceSummary(){
  const summary=FB.summarizeExperience(draft?.fields?.experience||'');
  $('totalWork').textContent=summary.totalMonths==null?'Unknown':`${summary.totalDuration} (${summary.totalYears} years)`;
  $('latestCompany').textContent=summary.latestCompany||'Unknown — verify employer';
  $('latestDuration').textContent=summary.latestMonths==null?'Unknown':`${summary.latestDuration} (${summary.latestYears} years)`;
  $('experienceNote').textContent=`${summary.datedRoles} dated position${summary.datedRoles===1?'':'s'} found. ${summary.note}`;
}
async function capture(){
  stateMessage('');
  // Request optional origin permission immediately in the user-click handler.
  const origins=['https://*.linkedin.com/*'];
  try{
    const granted=await chrome.permissions.request({origins});
    if(!granted)throw new Error('LinkedIn site permission was declined. You can grant it later and try again.');
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if(!tab?.id)throw new Error('No active browser tab. Open the candidate profile on the left first.');
    if(FB.canonicalUrl(tab.url)!==key())throw new Error('The current tab is not the selected candidate. Click Open profile on left first.');
    const response=await chrome.scripting.executeScript({target:{tabId:tab.id},func:fleetbridgeExtractVisibleProfile});
    const result=response?.[0]?.result;
    if(!result?.ok)throw new Error(result?.error||'The visible profile could not be read.');
    if(FB.canonicalUrl(result.url)!==key())throw new Error('The LinkedIn page changed during capture. Nothing saved.');
    const latestFields=FB.normalizeProfile(result.fields);
    // The user can scroll/expand LinkedIn and click Capture again. Keep any
    // information already reviewed or edited; fill only still-empty fields.
    const wasReviewing=Boolean(draft);
    const merged={};
    for(const field of FB.FIELDS){
      const old=draft?.fields[field]||'',fresh=latestFields[field]||'';
      const userModified=Boolean(draft&&old!==draft.capturedFields?.[field]);
      merged[field]=userModified?old:
        field==='experience'&&fresh.length>old.length?fresh:(old||fresh);
    }
    const sections=[...new Set([...(draft?.sections||[]),...result.sections])];
    const verifiedName=(lastDiagnostics?.nameSource==='heading'||result.diagnostics?.nameSource==='heading');
    const confidence=verifiedName&&merged.name&&merged.headline&&merged.experience?'high':
      merged.name&&merged.headline&&merged.experience?'medium':'low';
    draft={fields:merged,confidence,sections,capturedFields:{...merged}};
    lastDiagnostics={...result.diagnostics,nameSource:verifiedName?'heading':result.diagnostics?.nameSource||'missing'};
    const guidance=confidence==='low'?'Low confidence: verify the identity and capture Experience after scrolling.':'';
    captureMessage(`${wasReviewing?'Additional capture':'Capture'}: ${result.sections.length} Experience section(s) detected; ${merged.experience?'work history found':'no work history captured'}. ${guidance} ${result.problems.join(' ')||'Review the editable preview before saving.'}`+
      (lastDiagnostics?` Profile inspection: ${lastDiagnostics.anchorsFound||0} section anchors, ${lastDiagnostics.cardsExamined||0} cards checked, ${lastDiagnostics.visibleHeadings} visible headings; name source: ${lastDiagnostics.nameSource}.`:''));
    render();
  }catch(error){captureMessage(error.message,true);}
}
async function save(andNext){
  if(!draft||!key())return;
  try{
    // Read fields again, including anything edited just before clicking Save.
    const values={};for(const field of FB.FIELDS)values[field]=$('field-'+field).value;
    if(draft.confidence==='low'&&!confirm('The capture has low confidence or incomplete professional sections. Have you checked the candidate name and corrected the fields? Save anyway?'))return;
    const record=FB.mergeReview(current(),key(),values,'explicit_visible_page_click');
    await FBDB.save(record);rows.set(key(),record);
    draft=null;captureMessage('Candidate saved to your local database.');stateMessage('Saved successfully.');
    if(andNext)await move(1,true);else render();
  }catch(error){stateMessage(`Unable to save: ${error.message}`,true);}
}
$('dashboard').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('rebuild').addEventListener('click',()=>void buildQueue());
$('openProfile').addEventListener('click',()=>void openCurrent());
$('previous').addEventListener('click',()=>void move(-1,false));
$('next').addEventListener('click',()=>void move(1,true));
$('capture').addEventListener('click',()=>void capture());
$('save').addEventListener('click',()=>void save(false));
$('saveNext').addEventListener('click',()=>void save(true));
initialize();
