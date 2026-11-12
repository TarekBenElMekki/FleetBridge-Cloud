'use strict';
const $=id=>document.getElementById(id);
let allRows=[],filtered=[],map=null,mapEnabled=false,sites={sites:FBRatp.SEED,partial:true,syncedAt:null};
let sortKey='capture',sortAsc=true,resolvingGeo=false,geoProgress={done:0,total:0},analyticsCache=FBTalent.distribution([]),targetRole='heavy_maintenance';
let detailsCache=new WeakMap();
let enrichingWorkplaces=false;
const workGeocodePromises=new Map();
const geoCache=new Map(),facetSelected={capture:new Set(),experience:new Set(),type:new Set(),distance:new Set(),relevance:new Set(),region:new Set(),stage:new Set(),company:new Set(),siteType:new Set()};
const facets={capture:'facetCapture',experience:'facetExperience',type:'facetType',distance:'facetDistance',relevance:'facetRelevance',region:'facetRegion',stage:'facetStage',company:'facetCompany',siteType:'facetSiteType'};
function info(message,error=false){$('message').textContent=message;$('message').classList.toggle('error',error);}
function download(name,value,type){
  const blob=new Blob([value],{type}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function node(tag,value=''){const n=document.createElement(tag);n.textContent=String(value??'');return n;}
function clip(value,max=120){const s=String(value||'');return s.length>max?s.slice(0,max-1)+'…':s;}
function details(row){
  const cached=detailsCache.get(row);if(cached)return cached;
  const imp=row.profileImport||{},cap=row.profileCapture||{},location=imp.location||cap.fields?.location||'',
    roles=imp.experienceRoles?.length?imp.experienceRoles:cap.roles||[],
    total=roles.length?FBCareer.summary(roles):FB.summarizeExperience(imp.experience||cap.fields?.experience||''),
    capture=cap.capturedAt?'To review':imp.importedAt?'Reviewed':'Not captured',
    years=total.totalYears??(total.totalMonths!=null&&Number.isFinite(Number(total.totalMonths))?Number(total.totalMonths)/12:null),
    distance=FBTalent.distanceKm(row),workBreakdown=FBTalent.breakdown(row),relevance=FBMatch.evaluate(row,targetRole),
    plain=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    region=Object.values(FBCareer.FR_REGIONS).find(name=>plain(location).includes(plain(name)))||'Other / unknown';
  const result={name:cap.fields?.name||imp.name||row.title||row.url,
    headline:cap.fields?.headline||imp.headline||row.snippet||'',location,region,years,
    bucket:FBTalent.experienceBucket(FBTalent.totalMonths(row)),workBreakdown,roleTypes:FBTalent.roleTypes(row),relevance,distance,
    distanceBucket:FBTalent.distanceBucket(distance),
    experience:total.totalDuration||'Unverified',latestCompany:total.latestCompany||'Unverified',
    mobility:imp.mobility?.label||'Not assessed',work:imp.franceWork?.status||'Not assessed',
    capture,stage:row.status||'new',geo:imp.residenceGeo||null};
  detailsCache.set(row,result);return result;
}
function facetChoice(facet,value){return facetSelected[facet].size===0||facetSelected[facet].has(value);}
function renderFacet(id,options){
  const host=$(facets[id]);host.replaceChildren();
  for(const option of options){
    const label=node('label');label.className='filter-chip';
    const cb=document.createElement('input');cb.type='checkbox';cb.value=option;cb.checked=facetSelected[id].has(option);
    cb.addEventListener('change',()=>{if(cb.checked)facetSelected[id].add(option);else facetSelected[id].delete(option);
      label.classList.toggle('checked',cb.checked);render();});
    label.classList.toggle('checked',cb.checked);label.append(cb,node('span',option));host.append(label);
  }
}
function renderFacets(){
  renderFacet('capture',['Not captured','To review','Reviewed']);
  renderFacet('experience',FBTalent.EXPERIENCE);
  renderFacet('type',FBTalent.WORK_TYPES);
  renderFacet('distance',FBTalent.DISTANCE);
  renderFacet('relevance',FBMatch.LABELS);
  renderFacet('region',[...new Set(allRows.map(r=>details(r).region))].sort((a,b)=>a.localeCompare(b)));
  renderFacet('stage',[...new Set(allRows.map(r=>r.status||'new'))].sort());
  renderSiteFacets();
}
function renderSiteFacets(){
  renderFacet('company',[...new Set(sites.sites.map(s=>s.company))].sort());
  renderFacet('siteType',[...new Set(sites.sites.map(s=>s.category))].sort());
}
function visibleSites(){return sites.sites.filter(s=>facetChoice('company',s.company)&&facetChoice('siteType',s.category));}
function toggleChartFilter(facet,key){
  const selected=facetSelected[facet];
  if(selected.has(key))selected.delete(key);else selected.add(key);
  renderFacet(facet,facet==='experience'?FBTalent.EXPERIENCE:facet==='distance'?FBTalent.DISTANCE:
    facet==='type'?FBTalent.WORK_TYPES:[...new Set(allRows.map(r=>r.status||'new'))].sort());
  render();
}
function renderAnalytics(){
  const totals=analyticsCache;
  const reviewed=allRows.filter(r=>r.profileImport?.importedAt).length;
  $('experienceCoverage').textContent=`${totals.experience.known}/${totals.total} with dates · ${reviewed} human-reviewed · ${totals.experience.unknown} missing dates`;
  $('distanceCoverage').textContent=`${totals.distance.known}/${totals.total} geographically assessed · ${totals.distance.unknown} unknown`;
  $('stageCoverage').textContent=`${totals.total} candidates`;
  $('typeCoverage').textContent=`${totals.workTypes.total} parsed job records · ${reviewed} reviewed profiles`;
  for(const [id,group,facet] of [['experienceChart',totals.experience,'experience'],
    ['distanceChart',totals.distance,'distance'],['stageChart',totals.stages,'stage'],['typeChart',totals.workTypes,'type']]){
    FBTalent.drawBars($(id),group.bins,{selected:facetSelected[facet],onSelect:key=>toggleChartFilter(facet,key)});
  }
}
function renderMapPins(){
  if(!mapEnabled||!map)return;
  const candidates=$('layerCandidates').checked?filtered.flatMap(row=>{
    const d=details(row),geo=geoCache.get(d.location)||d.geo;
    return geo&&FBMap.valid(geo)?[{kind:'candidate',url:row.url,name:d.name,location:d.location,
      lat:geo.lat,lon:geo.lon}]:[];
  }):[];
  const workplaces=$('layerRatp').checked?visibleSites().map(s=>({...s,kind:'site'})):[];
  map.setItems([...workplaces,...candidates]);
  const unmapped=$('layerCandidates').checked?filtered.length-candidates.length:0;
  const coverage=sites.partial?'Partial registry search (not all depots guaranteed)':'Registry search results';
  $('mapStatus').textContent=`${workplaces.length} mapped RATP establishments · ${candidates.length}/${filtered.length} filtered candidates pinned${unmapped?` · ${unmapped} locations unresolved`:''} · ${coverage}${resolvingGeo?` · resolving ${geoProgress.done}/${geoProgress.total} cities…`:''}`;
}
function render(){
  $('total').textContent=allRows.length;
  $('captured').textContent=allRows.filter(r=>r.profileCapture).length;
  $('enriched').textContent=allRows.filter(r=>r.profileImport?.importedAt).length;
  $('pending').textContent=FB.pending(allRows).length;
  renderAnalytics();
  const term=$('search').value.trim().toLowerCase();
  filtered=allRows.filter(row=>{
    const d=details(row);
    if(!facetChoice('capture',d.capture)||!facetChoice('experience',d.bucket)||!facetChoice('distance',d.distanceBucket)||
      !facetChoice('relevance',d.relevance.label)||
      (facetSelected.type.size&&!d.roleTypes.some(type=>facetSelected.type.has(type)))||
      !facetChoice('region',d.region)||!facetChoice('stage',d.stage))return false;
    const hay=[row.title,row.snippet,row.url,row.notes,d.name,d.location,d.headline,d.latestCompany,
      ...(row.profileImport?.experienceRoles||[]).flatMap(r=>[r.company,r.title,r.locationRaw]),
      ...(row.profileCapture?.roles||[]).flatMap(r=>[r.company,r.title,r.locationRaw])].join(' ').toLowerCase();
    return !term||hay.includes(term);
  }).sort((a,b)=>{
    const left=details(a),right=details(b);
    const x=sortKey==='capture'?left.capture:sortKey==='name'?left.name:sortKey==='city'?left.location:
      sortKey==='years'?left.years??-1:sortKey==='distance'?left.distance??-1:left.stage;
    const y=sortKey==='capture'?right.capture:sortKey==='name'?right.name:sortKey==='city'?right.location:
      sortKey==='years'?right.years??-1:sortKey==='distance'?right.distance??-1:right.stage;
    const delta=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));
    return (sortAsc?delta:-delta)||left.name.localeCompare(right.name);
  });
  $('visibleCount').textContent=`${filtered.length.toLocaleString()} / ${allRows.length.toLocaleString()} candidates${filtered.length>2500?' · first 2,500 displayed':''} · CSV exports all filtered records`;
  const body=$('tableBody');body.replaceChildren();
  for(const row of filtered.slice(0,2500)){
    const d=details(row),tr=node('tr');
    tr.className=globalThis.FBWorkspace?.selectedUrl===FB.canonicalUrl(row.url)?'selected-row':'';
    const cell=node('td'),button=node('button',clip(d.name,70));
    button.className='candidate-select';button.addEventListener('click',()=>globalThis.FBWorkspace?.select(row.url));cell.append(button);
    const subtitle=node('div',clip(d.headline,70));subtitle.className='meta';cell.append(subtitle);
    const status=node('span',d.capture);status.className=`status-tag ${d.capture==='To review'?'pending':'neutral'}`;cell.append(status);
    const profile=node('td'),link=node('a','Open ↗');link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';profile.append(link);
    const evidence=node('td',d.relevance.label);evidence.className='role-evidence';
    const evidenceSub=node('span',d.relevance.source);evidenceSub.className='role-evidence-sub';evidence.append(evidenceSub);
    evidence.title=d.relevance.evidence||'No matching role wording in captured title or headline.';
    const months=value=>value==null?'Unknown':`${Math.floor(value/12)}y ${value%12}m`;
    tr.append(cell,node('td',d.location||'Unknown'),node('td',d.experience),
      node('td',months(d.workBreakdown.nonInternshipMonths)),node('td',months(d.workBreakdown.internshipMonths)),node('td',d.latestCompany),
      node('td',d.distance==null?'Unverified':`${d.distance.toLocaleString()} km`),
      node('td',clip(d.mobility,60)),evidence,node('td',clip(d.work,50)),node('td',d.stage),profile);
    body.append(tr);
  }
  if(!filtered.length){const tr=node('tr'),td=node('td','No candidates match. Uncheck one or more filters.');td.colSpan=12;tr.append(td);body.append(tr);}
  renderMapPins();
}
async function reload(){
  try{const fetched=await FBDB.all();allRows=[];
    for(const record of fetched){
      const upgraded=FB.upgradeCapture(record);
      if(upgraded!==record)await FBDB.save(upgraded);
      allRows.push(upgraded);
    }
    detailsCache=new WeakMap();analyticsCache=FBTalent.distribution(allRows);
    globalThis.FBWorkspace?.reconcile(allRows);renderFacets();render();
    if(mapEnabled)void resolveCandidates();
    void enrichWorkplaceLocations();}
  catch(e){info(`Unable to load database: ${e.message}`,true);}
}
async function enrichWorkplaceLocations(){
  if(enrichingWorkplaces)return;
  // Only captured, pending-review records. Reviewer-approved jobs are not
  // rewritten in the background. Cap each pass for responsive workspaces.
  const targets=allRows.filter(row=>row.profileCapture?.roles?.some(role=>
    role.locationRaw&&!(Number.isFinite(role.geo?.lat)&&Number.isFinite(role.geo?.lon))&&
    !workGeocodePromises.has(role.locationRaw.trim().toLowerCase()))).slice(0,60);
  if(!targets.length)return;
  enrichingWorkplaces=true;let changed=0,done=0,next=0;
  info(`Resolving reported workplace cities for ${targets.length} captured profiles. Only place names are queried.`);
  const worker=async()=>{
    while(next<targets.length){
      const row=targets[next++],cap=row.profileCapture,updates=[];
      if(!cap)continue;
      for(const role of cap.roles||[]){
        if(!role.locationRaw||(Number.isFinite(role.geo?.lat)&&Number.isFinite(role.geo?.lon)))continue;
        const raw=role.locationRaw,key=raw.trim().toLowerCase();
        if(!workGeocodePromises.has(key))workGeocodePromises.set(key,FBGeo.resolveLocation(raw).catch(error=>({geo:null,reason:error.message})));
        const resolved=await workGeocodePromises.get(key);
        if(resolved.geo)updates.push({id:role.id,startDate:role.startDate,locationRaw:raw,geo:resolved.geo,reason:resolved.reason});
      }
      if(updates.length&&await FBDB.mergeCapturedGeos(row.url,cap.capturedAt,updates))changed++;
      done++;
      if(done%5===0||done===targets.length)info(`Workplace locality lookup: ${done}/${targets.length} profiles checked. ${changed} enriched.`);
    }
  };
  try{await Promise.all([worker(),worker()]);}
  catch(e){info(`Automatic city lookup stopped: ${e.message}`,true);}
  finally{enrichingWorkplaces=false;if(changed)await reload();}
}
async function loadSites(){sites=await FBRatp.read(chrome.storage.local);renderSiteFacets();renderMapPins();}
async function syncSites(){
  $('syncSites').disabled=true;$('mapStatus').textContent='Refreshing official registry records…';
  try{sites=await FBRatp.sync(chrome.storage.local,fetch,text=>$('mapStatus').textContent=`Official registry: ${text}`);
    renderSiteFacets();renderMapPins();info(`RATP workplace refresh completed: ${sites.sites.length} coordinate-backed records. Registry search may omit sites.`);
  }catch(e){await loadSites();info(`Registry unavailable; existing markers preserved. ${e.message}`,true);}
  finally{$('syncSites').disabled=false;}
}
async function resolveCandidates(){
  if(resolvingGeo)return;
  const unique=[...new Set(allRows.map(r=>details(r).location).filter(Boolean))].filter(x=>!geoCache.has(x));
  if(!unique.length){renderMapPins();return;}
  resolvingGeo=true;geoProgress={done:0,total:unique.length};
  let index=0;
  const worker=async()=>{
    while(index<unique.length&&mapEnabled){
      const place=unique[index++];
      try{const resolved=await FBGeo.resolveLocation(place);geoCache.set(place,resolved.geo||null);}
      catch(_){geoCache.set(place,null);}
      geoProgress.done++;
      if(geoProgress.done%6===0||geoProgress.done===geoProgress.total)renderMapPins();
    }
  };
  try{await Promise.all([worker(),worker(),worker()]);}
  finally{resolvingGeo=false;renderMapPins();}
}
function switchView(view){
  mapEnabled=view==='map';$('mapSection').classList.toggle('hidden',!mapEnabled);
  $('tableSection').classList.toggle('hidden',mapEnabled);
  $('mapView').classList.toggle('is-active',mapEnabled);$('tableView').classList.toggle('is-active',!mapEnabled);
  $('mapView').setAttribute('aria-selected',String(mapEnabled));$('tableView').setAttribute('aria-selected',String(!mapEnabled));
  if(mapEnabled){if(!map)map=FBMap.create($('realMap'),{onCandidate:url=>globalThis.FBWorkspace?.select(url)});
    map.render();renderMapPins();void resolveCandidates();}
}
$('search').addEventListener('input',render);
$('targetRole').addEventListener('change',()=>{
  targetRole=$('targetRole').value;detailsCache=new WeakMap();
  chrome.storage.local.set({fleetbridgeTargetRoleV142:targetRole}).catch(()=>{});render();
});
$('refresh').addEventListener('click',reload);
for(const button of document.querySelectorAll('.clear-facet'))button.addEventListener('click',()=>{
  facetSelected[button.dataset.facet].clear();renderFacets();render();
});
for(const button of document.querySelectorAll('[data-sort]'))button.addEventListener('click',()=>{
  if(sortKey===button.dataset.sort)sortAsc=!sortAsc;else{sortKey=button.dataset.sort;sortAsc=true;}render();
});
$('tableView').addEventListener('click',()=>switchView('table'));
$('mapView').addEventListener('click',()=>switchView('map'));
for(const id of ['layerCandidates','layerRatp'])$(id).addEventListener('change',renderMapPins);
$('syncSites').addEventListener('click',()=>void syncSites());
$('exportCsv').addEventListener('click',()=>{
  download('FleetBridge_candidates_'+new Date().toISOString().slice(0,10)+'.csv',FB.toCsv(filtered),'text/csv;charset=utf-8');
  info(`Exported ${filtered.length} filtered candidates.`);
});
$('exportJson').addEventListener('click',()=>{
  download('FleetBridge_database_backup_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(allRows,null,2),'application/json;charset=utf-8');
  info(`Backup ready: ${allRows.length} candidates.`);
});
$('restore').addEventListener('click',()=>$('restoreFile').click());
$('restoreFile').addEventListener('change',async event=>{
  try{
    const file=event.target.files?.[0];if(!file)return;
    if(file.size>80_000_000)throw new Error('Backup exceeds 80 MB.');
    const value=JSON.parse(await file.text()),records=Array.isArray(value)?value:(value.records||value.profiles||value.rows);
    if(!Array.isArray(records))throw new Error('Expected a candidate array.');
    if(!confirm(`Merge ${records.length} candidates? Existing records are preserved where possible.`))return;
    const r=await FBDB.restore(records);await reload();info(`Restored ${r.added} new and ${r.updated} existing records.`);
  }catch(e){info(e.message,true);}finally{event.target.value='';}
});
$('sidePanel').addEventListener('click',async()=>{
  try{const win=await chrome.windows.getCurrent();await chrome.sidePanel.open({windowId:win.id});}
  catch(e){info(e.message,true);}
});
globalThis.render=render;
chrome.storage.local.get('fleetbridgeTargetRoleV142').then(value=>{
  const saved=value.fleetbridgeTargetRoleV142;
  if(FBMatch.TARGETS[saved]){targetRole=saved;$('targetRole').value=saved;detailsCache=new WeakMap();render();}
}).catch(()=>{});
void loadSites();void reload();
