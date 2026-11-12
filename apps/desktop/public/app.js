'use strict';

const $ = id => document.getElementById(id);
const state = {candidates: [], establishments: [], companies: [], selected: null, selectedCompany: null, cityIndex: new Map(), historyMap: null, historyLayer: null};
const stages = {
  new: 'New', reviewing: 'Reviewing', shortlisted: 'Shortlisted',
  contacted: 'Contacted', interview: 'Interview', rejected: 'Rejected'
};
function safe(value) { return String(value ?? ''); }
function addText(host, tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = safe(value);
  if (className) element.className = className;
  host.append(element);
  return element;
}
function say(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.style.display = 'block';
  clearTimeout(say.timeout);
  say.timeout = setTimeout(() => toast.style.display = 'none', 4500);
}
async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (response.status===401 && path!=='/api/auth/login') { window.location.replace('/login'); throw Error('FleetBridge session locked.'); }
  if (!response.ok) throw Error(data.error || 'Request failed (' + response.status + ')');
  return data;
}
const post = (path, payload) => api(path, {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(payload)
});
function label(row) {
  return row.profileImport?.name || row.profileCapture?.fields?.name ||
    row.title?.replace(/\s*[-|].*$/, '') || 'Unidentified profile';
}
function role(row) {
  return row.profileImport?.headline || row.profileCapture?.fields?.headline ||
    row.snippet || 'No professional headline available';
}
function candidateLocation(row) {
  return row.profileImport?.location || row.profileCapture?.fields?.location ||
    row.location || row.profile?.location || 'Location not captured';
}
function hasLocation(row) { return candidateLocation(row) !== 'Location not captured'; }
function status(row) { return safe(row.status || 'new').toLowerCase(); }
function source(row) {
  return row.profileImport?.importedAt ? 'Reviewed profile' :
    row.profileCapture ? 'Chrome capture' : 'Google discovery';
}
function initials(name) {
  const parts = safe(name).split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || 'F') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
function closeInspector() {
  $('inspector').classList.remove('open');
  $('inspector').setAttribute('aria-hidden', 'true');
}
function syncAtlasPresentation() {
  // Atlas owns its embedded layout and theme styles. The Desktop only communicates
  // workspace state; no runtime CSS is injected into the second document.
  const frame = $('atlas-frame');
  const doc = frame.contentDocument;
  if (!doc?.documentElement) return;
  doc.documentElement.classList.add('embedded');
  doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
  frame.contentWindow?.postMessage({
    type: 'FLEETBRIDGE_PRESENTATION',
    theme: document.documentElement.dataset.theme,
    active: document.body.classList.contains('atlas-mode')
  }, window.location.origin);
}
function connectionState(online) {
  document.body.classList.toggle('connection-offline', !online);
  $('connection-label').textContent = online ? 'Local service online' : 'Local service offline';
  $('top-connection').textContent = online ? 'Local data connected' : 'Local service unavailable';
}
const routes = {crm: 'candidates', companies: 'companies', contracts: 'contracts', map: 'map'};
function fromRoute(hash = window.location.hash) {
  const key = hash.replace(/^#\/?/, '').split(/[/?]/)[0].toLowerCase();
  return ({candidates: 'crm', crm: 'crm', companies:'companies', contracts:'contracts', atlas: 'map', map: 'map'})[key] || 'crm';
}
function setView(view, updateRoute = true) {
  if (!Object.hasOwn(routes, view)) return;
  for (const element of document.querySelectorAll('.view'))
    element.classList.toggle('active', element.id === (view === 'companies' ? 'companies-view' : view));
  for (const element of document.querySelectorAll('.nav')) {
    const active = element.dataset.view === view;
    element.classList.toggle('active', active);
    if (active) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  }
  $('page-name').textContent = view === 'crm' ? 'Candidates' :
    view === 'companies' ? 'Companies' : view === 'contracts' ? 'Contracts' : 'Map';
  document.body.classList.toggle('atlas-mode', view === 'map');
  document.body.classList.toggle('companies-mode', view === 'companies');
  document.body.classList.toggle('contracts-mode', view === 'contracts');
  document.body.dataset.view = view;
  if (updateRoute && window.location.hash !== '#/' + routes[view]) {
    window.history.pushState({view}, '', '#/' + routes[view]);
  }
  if (view !== 'crm') closeInspector();
  if (view === 'map') {
    syncAtlasPresentation();
    $('atlas-frame').contentWindow?.postMessage({type: 'FLEETBRIDGE_REFRESH_CANDIDATES'}, window.location.origin);
  }
  if (view === 'companies') renderCompanies();
  if (view === 'contracts') window.FBContracts?.load();
  if (view !== 'companies') $('company-inspector').classList.remove('open');
  if (view !== 'contracts') window.FBContracts?.close();
}
function applyTheme() {
  // FleetBridge V2.2 is light-only. The Atlas follows the same system appearance.
  document.documentElement.dataset.theme = 'light';
  document.documentElement.style.colorScheme = 'light';
  syncAtlasPresentation();
}
function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', collapsed);
  $('sidebar-toggle').setAttribute('aria-expanded', String(!collapsed));
  $('sidebar-toggle').setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  $('sidebar-toggle').firstChild.textContent = collapsed ? '› ' : '‹ ';
  try { localStorage.setItem('fleetbridge_sidebar_collapsed', String(collapsed)); } catch {}
}
function atlasAction(elementId) {
  try {
    const frame = $('atlas-frame');
    const control = frame.contentDocument?.getElementById(elementId);
    if (!control) throw Error('The atlas is still loading. Please try again.');
    control.click();
  } catch (error) {
    say(error.message || 'Could not access atlas controls.');
  }
}
function clearFilters() {
  $('search').value = '';
  $('stage-filter').value = 'all';
  $('location-filter').value = 'all';
  $('source-filter').value = 'all';
  renderCandidates();
}
function renderCandidates() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const stage = $('stage-filter').value;
  const location = $('location-filter').value;
  const candidateSource = $('source-filter').value;
  const found = state.candidates.filter(row => {
    if (candidateSource !== 'all' && source(row) !== candidateSource) return false;
    if (stage !== 'all' && status(row) !== stage) return false;
    if (location === 'known' && !hasLocation(row)) return false;
    if (location === 'missing' && hasLocation(row)) return false;
    return !query || [label(row), candidateLocation(row), role(row), row.url,
      row.notes, row.profileImport?.latestCompany].some(value => safe(value).toLocaleLowerCase().includes(query));
  });
  $('total').textContent = state.candidates.length.toLocaleString();
  $('reviewed').textContent = state.candidates.filter(row => row.profileImport?.importedAt).length.toLocaleString();
  $('active').textContent = state.candidates.filter(row => !['new', 'rejected'].includes(status(row))).length.toLocaleString();
  $('companies').textContent = state.companies.length.toLocaleString();
  $('nav-candidate-count').textContent = state.candidates.length.toLocaleString();
  $('visible-count').textContent = found.length.toLocaleString();
  $('table-caption').textContent = found.length.toLocaleString() + ' of ' +
    state.candidates.length.toLocaleString() + ' candidates in this view';
  $('table-footer-count').textContent = 'Showing ' + Math.min(found.length, 5000).toLocaleString() +
    ' of ' + found.length.toLocaleString() + ' matching records';
  $('clear-filters').hidden = !query && stage === 'all' && location === 'all' && candidateSource === 'all';
  const tbody = $('rows');
  tbody.replaceChildren();
  for (const row of found.slice(0, 5000)) {
    const tr = document.createElement('tr');
    tr.tabIndex = 0;
    tr.className = 'candidate-row';
    tr.dataset.url = safe(row.url);
    tr.setAttribute('aria-label', 'Review ' + label(row));
    if (state.selected?.url === row.url) tr.classList.add('is-selected');
    const personCell = document.createElement('td');
    const person = addText(personCell, 'div', '', 'candidate-person');
    addText(person, 'span', initials(label(row)), 'candidate-avatar');
    const details = addText(person, 'span', '', 'candidate-text');
    addText(details, 'strong', label(row));
    // An unknown role must not create a decorative or apologetic underlabel.
    if (role(row) !== 'No professional headline available') addText(details, 'small', role(row), 'candidate-role');
    tr.append(personCell);
    const locationCell = document.createElement('td');
    addText(locationCell, 'span', hasLocation(row) ? candidateLocation(row) : 'Not captured',
      hasLocation(row) ? 'location-text' : 'location-missing');
    tr.append(locationCell);
    const stageCell = document.createElement('td');
    const badge = addText(stageCell, 'span', stages[status(row)] || status(row), 'stage');
    badge.dataset.stage = status(row);
    tr.append(stageCell);
    addText(tr, 'td', source(row), 'source-cell');
    const actionCell = document.createElement('td');
    const review = addText(actionCell, 'button', 'Review', 'review-link');
    review.type = 'button';
    review.addEventListener('click', event => { event.stopPropagation(); select(row.url); });
    tr.append(actionCell);
    tr.addEventListener('click', () => select(row.url));
    tr.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); select(row.url);
      }
    });
    tbody.append(tr);
  }
  $('empty-state').hidden = found.length > 0;
}
function select(url) {
  const row = state.candidates.find(candidate => candidate.url === url);
  if (!row) return;
  state.selected = row;
  $('inspector').classList.add('open');
  $('inspector').removeAttribute('aria-hidden');
  $('inspector-avatar').textContent = initials(label(row));
  $('inspector-name').textContent = label(row);
  $('inspector-details').textContent = candidateLocation(row) + ' · ' + role(row);
  updateRadar(row); renderHistory(row);
  $('inspector-editor').hidden = false;
  $('edit-stage').value = stages[status(row)] ? status(row) : 'new';
  $('edit-notes').value = row.notes || '';
  const link = $('open-link');
  try {
    const parsed = new URL(row.url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw Error('Invalid URL');
    link.href = parsed.href;
    link.hidden = false;
  } catch {
    link.removeAttribute('href');
    link.hidden = true;
  }
  for (const tr of document.querySelectorAll('.candidate-row'))
    tr.classList.toggle('is-selected', tr.dataset.url === row.url);
}
async function refresh() {
  try {
    const [c, e] = await Promise.all([api('/api/candidates'), api('/api/establishments')]);
    state.candidates = c.records || [];
    state.establishments = e.records || [];
    if (state.selected)
      state.selected = state.candidates.find(row => row.url === state.selected.url) || null;
    renderCandidates();
    connectionState(true);
    $('atlas-frame').contentWindow?.postMessage({type: 'FLEETBRIDGE_REFRESH_CANDIDATES'}, window.location.origin);
  } catch (error) {
    connectionState(false);
    throw error;
  }
}
async function downloadBackup() {
  const data = await api('/api/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'FleetBridge_Desktop_Backup_' + new Date().toISOString().slice(0, 10) + '.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
for (const button of document.querySelectorAll('[data-view]'))
  button.addEventListener('click', () => setView(button.dataset.view));
$('sidebar-toggle').addEventListener('click', () =>
  setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed')));
window.addEventListener('popstate', () => setView(fromRoute(), false));
window.addEventListener('hashchange', () => setView(fromRoute(), false));
$('refresh').addEventListener('click', () =>
  refresh().then(() => say('Local database refreshed.')).catch(error => say(error.message)));
$('search').addEventListener('input', renderCandidates);
$('stage-filter').addEventListener('change', renderCandidates);
$('location-filter').addEventListener('change', renderCandidates);
$('source-filter').addEventListener('change', renderCandidates);
$('clear-filters').addEventListener('click', clearFilters);
$('empty-clear').addEventListener('click', clearFilters);
$('close-inspector').addEventListener('click', closeInspector);
$('save-edit').addEventListener('click', async () => {
  if (!state.selected) return;
  const selectedUrl = state.selected.url;
  try {
    await post('/api/candidate', {
      url: selectedUrl,
      updates: {status: $('edit-stage').value, notes: $('edit-notes').value}
    });
    await refresh();
    select(selectedUrl);
    say('Candidate record saved.');
  } catch (error) { say(error.message); }
});
$('import').addEventListener('click', () => $('json-file').click());
$('json-file').addEventListener('change', async () => {
  const file = $('json-file').files[0];
  if (!file) return;
  if (file.size > 80 * 1024 * 1024) { say('JSON backup exceeds 80 MB.'); return; }
  try {
    const content = JSON.parse(await file.text());
    const result = await post('/api/import', content);
    await refresh();
    say('Imported: ' + result.added + ' new and ' + result.updated + ' updated candidates.');
  } catch (error) { say(error.message); }
  finally { $('json-file').value = ''; }
});
for (const id of ['export'])
  $(id).addEventListener('click', () => downloadBackup().catch(error => say(error.message)));
$('logout').addEventListener('click', () => post('/api/auth/logout',{}).then(()=>window.location.assign('/login')).catch(error=>say(error.message)));
$('atlas-frame').addEventListener('load', syncAtlasPresentation);
$('atlas-template').addEventListener('click', () => atlasAction('downloadTemplate'));
$('atlas-import').addEventListener('click', () => atlasAction('fileImport'));
document.addEventListener('keydown', event => {
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (event.key === 'Escape') closeInspector();
  if ((event.key === '/' && !editing) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault(); setView('crm'); $('search').focus();
  }
});
window.addEventListener('message', event => {
  if (event.origin !== window.location.origin || event.source !== $('atlas-frame').contentWindow) return;
  if (event.data?.type === 'FLEETBRIDGE_SHOW_CRM') setView('crm');
  if (event.data?.type === 'FLEETBRIDGE_OPEN_CANDIDATE' && typeof event.data.url === 'string') {
    setView('crm'); select(event.data.url);
  }
});
closeInspector();
$('close-company-inspector').addEventListener('click',()=>{$('company-inspector').classList.remove('open');state.selectedCompany=null;});
$('company-search').addEventListener('input',renderCompanies);
$('company-sector').addEventListener('change',renderCompanies);
$('company-country').addEventListener('change',renderCompanies);
$('company-group').addEventListener('input',renderCompanies);
$('company-origin').addEventListener('change',renderCompanies);
$('clear-company-filters').addEventListener('click',()=>{for(const id of ['company-search','company-group']) $(id).value='';for(const id of ['company-sector','company-country','company-origin']) $(id).value='all';renderCompanies();});
applyTheme();
try { setSidebarCollapsed(localStorage.getItem('fleetbridge_sidebar_collapsed') === 'true'); }
catch { setSidebarCollapsed(false); }
setView(fromRoute(), false);
refresh().then(loadCompanyDirectory).then(()=>{renderCandidates();renderRadar(null);if(state.selected)renderHistory(state.selected);}).catch(error => say('Could not load local database: ' + error.message));

// Source-linked company table and evidence-driven candidate intelligence.
async function loadCompanyDirectory(){
  const [atlas,heavy,custom,prospects,geo]=await Promise.all([
    api('/atlas/data.json'),api('/atlas/heavy-vehicles.json'),api('/api/atlas-custom'),api('/api/atlas-prospects'),api('/atlas/french-cities.json')
  ]);
  state.cityIndex=FBV21.cityIndex(geo);
  const atlasRecords=(atlas.operators||[]).map(x=>({...x,sector:'public'}));
  const heavyRecords=(heavy.records||[]).map(x=>({...x,sector:'heavy'}));
  const customs=(custom.records||[]).filter(x=>x.type!=='candidate').map(x=>({...x,sector:x.sector||'public',origin:'manual'}));
  const establishments=state.establishments.map(x=>({...x,sector:x.sector||'public',lat:Number(x.lat),lng:Number(x.lon),code:x.code||'FR',city:x.city||x.address||'',origin:'recorded-establishment'}));
  const unique=new Map();for(const company of [...atlasRecords,...heavyRecords,...customs,...establishments]){
    if(company.id&&!unique.has(company.id))unique.set(company.id,company);
  }
  state.companies=[...unique.values()].sort((a,b)=>{const rank=x=>x.sector==='heavy'?0:x.code==='FR'?1:2;return rank(a)-rank(b)||String(a.name).localeCompare(String(b.name));});
  state.companyProspects=prospects.statuses||{};
  const list=$('company-country');const countries=[...new Set(state.companies.map(x=>x.code).filter(Boolean))].sort();
  for(const code of countries){const option=document.createElement('option');option.value=code;option.textContent=code;list.append(option);}
  $('nav-company-count').textContent=state.companies.length.toLocaleString();
  $('company-coverage').textContent=`${atlasRecords.length} public transport · ${heavyRecords.length} heavy vehicle · ${customs.length+establishments.length} local records · coverage incomplete`;
  renderCompanies();
}
function renderCompanies(){
  const tbody=$('company-rows'),query=$('company-search').value.trim().toLocaleLowerCase(),sector=$('company-sector').value,country=$('company-country').value,group=$('company-group').value.trim().toLocaleLowerCase(),origin=$('company-origin').value;
  const originCategory=o=>o.sector==='heavy'?'official':(o.origin==='manual'||o.origin==='recorded-establishment'?'manual':'atlas');
  const found=state.companies.filter(o=>(sector==='all'||o.sector===sector)&&(country==='all'||o.code===country)&&(origin==='all'||originCategory(o)===origin)&&(!group||safe(o.group||'Not recorded').toLocaleLowerCase().includes(group))&&(!query||[o.name,o.city,o.group,o.country,o.activity].some(v=>safe(v).toLocaleLowerCase().includes(query))));
  $('clear-company-filters').hidden=!query&&sector==='all'&&country==='all'&&!group&&origin==='all';
  $('company-count').textContent=found.length.toLocaleString();$('company-footer').textContent=`${Math.min(found.length,5000)} of ${found.length} matches · ${state.companies.length} total`;
  tbody.replaceChildren();
  for(const o of found.slice(0,5000)){
    const tr=document.createElement('tr');tr.className='candidate-row';tr.tabIndex=0;
    tr.dataset.companyId=safe(o.id);
    if(state.selectedCompany?.id===o.id)tr.classList.add('is-selected');
    const companyNameCell=addText(tr,'td',o.name||'Unnamed employer','company-strong');companyNameCell.title=o.name||'Unnamed employer';
    addText(tr,'td',o.sector==='heavy'?'Heavy trucks':'Public transport','company-sector');
    addText(tr,'td',[o.city,o.code].filter(Boolean).join(', '));
    addText(tr,'td',o.group||'Not recorded');
    addText(tr,'td',o.sector==='heavy'?'Official company site':o.origin||'Atlas directory');
    const cell=document.createElement('td'),btn=addText(cell,'button','Inspect','review-link');btn.type='button';tr.append(cell);
    tr.addEventListener('click',()=>selectCompany(o));btn.addEventListener('click',event=>{event.stopPropagation();selectCompany(o);});
    tr.addEventListener('keydown',event=>{if(event.key==='Enter'){selectCompany(o);event.preventDefault();}});
    tbody.append(tr);
  }
  $('company-empty').hidden=Boolean(found.length);
}
function selectCompany(company){
  state.selectedCompany=company;
  for(const tr of $('company-rows').querySelectorAll('tr'))tr.classList.toggle('is-selected',tr.dataset.companyId===safe(company.id));
  const body=$('company-inspector-body');body.replaceChildren();
  const title=addText(body,'h2',company.name||'Company');title.className='inspector-company-title';
  const facts=[['Sector',company.sector==='heavy'?'Poids lourds / heavy vehicles':'Public transportation'],['City',company.city||'Unknown'],['Country',company.country||company.code||'Unknown'],['Group',company.group||'Not recorded'],['Activity',company.activity||company.mode||'Not specified'],['Prospect',state.companyProspects?.[company.id]||'New'],['Precision',company.precision||'Location precision not verified'],['Reported address',company.address||'Not recorded']];
  for(const [key,value] of facts){const block=addText(body,'div','','company-fact');addText(block,'span',key);addText(block,'strong',value);}
  const note=addText(body,'p','Map locations represent approximate commune centres unless verified coordinates are supplied. Proximity is not a vacancy or hiring confirmation.','history-evidence');
  const source=company.sourceUrl||company.source;
  try{const uri=new URL(source);if(uri.protocol==='https:'||uri.protocol==='http:'){const a=addText(body,'a','Open source website ↗','company-action');a.href=uri.href;a.target='_blank';a.rel='noopener noreferrer';}}catch{}
  const onMap=addText(body,'button','Show company on map','primary company-action');onMap.type='button';onMap.addEventListener('click',()=>{
    setView('map');const frame=$('atlas-frame');
    const send=()=>frame.contentWindow?.postMessage({type:'FLEETBRIDGE_SELECT_EMPLOYER',id:company.id,sector:company.sector},window.location.origin);
    send();setTimeout(send,350);
  });
  $('company-inspector').classList.add('open');
}
function renderRadar(row){
  const age=row?FBV21.age(row):null,years=row?FBV21.experience(row):null,geo=row?hasLocation(row):null;
  const x=$('radar-actual');
  if(age===null||years===null||geo===null){x.setAttribute('points','');}
  else{
    const vals=[age<=55?1:0,Math.min(years/5,1),geo?1:0],center=[87,89],outer=[[87,16],[23,126],[151,126]];
    x.setAttribute('points',vals.map((ratio,i)=>[center[0]+(outer[i][0]-center[0])*ratio,center[1]+(outer[i][1]-center[1])*ratio].join(',')).join(' '));
  }
  $('radar-name').textContent=row?label(row):'Candidate eligibility signals';
  $('radar-facts').textContent=row?`Age: ${age===null?'Unknown':age+' years'} · Experience: ${years===null?'Unknown':years+' years'} · Location: ${geo?'Captured':'Missing'}`:'Select a candidate to compare explicit evidence. Missing data remains unknown.';
}
const updateRadar=renderRadar;
let historyMapInitialized=false;
function buildHistoryMap(){
  if(historyMapInitialized||typeof L==='undefined')return;
  state.historyMap=L.map('candidate-history-map',{zoomControl:false,attributionControl:true,scrollWheelZoom:false,minZoom:3,maxZoom:14}).setView([46.6,2.4],5);
  L.control.zoom({position:'bottomright'}).addTo(state.historyMap);
  state.historyLayer=L.layerGroup().addTo(state.historyMap);
  fetch('/atlas/france-departments.json').then(r=>r.json()).then(data=>L.geoJSON(data,{interactive:false,style:{color:'#6a98a4',weight:.55,fillColor:'#153c49',fillOpacity:.07}}).addTo(state.historyMap)).catch(()=>{});
  historyMapInitialized=true;
}
function renderHistory(row){
  buildHistoryMap();
  const roles=FBV21.workLocations(row,state.cityIndex),evidence=$('history-evidence'),recommend=$('nearest-company');
  evidence.textContent=roles.length?`${roles.length} recorded workplace location(s), shown at approximate commune centres when exact workplace coordinates are absent. This is employment history, not home address.`:'No geocoded historical workplaces in this record. Add dated, structured workplace locations to enable this map.';
  if(state.historyMap){const layer=state.historyLayer;layer.clearLayers();let bounds=[];
    roles.forEach((point,i)=>{const latlng=[point.lat,point.lng];bounds.push(latlng);L.circleMarker(latlng,{radius:6,color:'#13a898',fillColor:'#13a898',fillOpacity:.8,weight:2}).bindTooltip(`${i+1}. ${point.company} — ${point.city}`).addTo(layer);});
    if(bounds.length>1)L.polyline(bounds,{color:'#13a898',weight:2,dashArray:'4,4'}).addTo(layer);
    if(bounds.length>1)state.historyMap.fitBounds(bounds,{padding:[30,30],maxZoom:9});else if(bounds.length===1)state.historyMap.setView(bounds[0],8);else state.historyMap.setView([46.6,2.4],5);
    setTimeout(()=>state.historyMap?.invalidateSize(),100);
  }
  const anchor=roles.length?roles[roles.length-1]:FBV21.geolocate(candidateLocation(row),state.cityIndex);
  const near=FBV21.closestTransit(anchor,state.companies);
  if(near){recommend.replaceChildren();addText(recommend,'strong','Nearest mapped public-transport operator (geographic only): ');addText(recommend,'span',`${near.name} · ${near.city} · approximately ${Math.round(near.distanceKm)} km straight-line from ${anchor.city}. Not a job vacancy.`);}
  else recommend.textContent='No reliable location available for a nearby-operator suggestion.';
  const age=FBV21.age(row),xp=FBV21.experience(row);$('candidate-summary-inspector').textContent=`Age threshold ≤55: ${age===null?'Unknown':age<=55?'Within reference':'Above reference'} · 5+ years experience: ${xp===null?'Unknown':xp>=5?'Met':'Not met'} · Geographic evidence: ${hasLocation(row)?'Captured':'Missing'}.`;
}
