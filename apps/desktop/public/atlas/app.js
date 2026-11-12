/* FleetBridge Employer Atlas — entirely client-side prospecting UI. */
const $=id=>document.getElementById(id);
const ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const COUNTRIES={FR:'France',DE:'Germany',GB:'United Kingdom',ES:'Spain',IT:'Italy',NL:'Netherlands',BE:'Belgium',LU:'Luxembourg',CH:'Switzerland',AT:'Austria',PT:'Portugal',IE:'Ireland',PL:'Poland',CZ:'Czechia',SK:'Slovakia',HU:'Hungary',RO:'Romania',HR:'Croatia',SI:'Slovenia',RS:'Serbia',BA:'Bosnia and Herzegovina',BG:'Bulgaria',MD:'Moldova',ME:'Montenegro',UA:'Ukraine',MK:'North Macedonia',DK:'Denmark',SE:'Sweden',NO:'Norway',FI:'Finland',EE:'Estonia',LV:'Latvia',LT:'Lithuania',GR:'Greece',CY:'Cyprus',MT:'Malta',IS:'Iceland',TR:'Türkiye'};
const COLORS={'RATP Group':'#c83255','Keolis':'#7254b1','Transdev':'#df793e','Arriva':'#209aa3','Deutsche Bahn':'#e43a40','SNCF':'#ae4585','Nobina':'#409f69','Go-Ahead':'#83a73a','Stagecoach':'#367dc6','FirstGroup':'#2166a1','Mobico':'#be9334','ComfortDelGro':'#5e7db9','FS Group':'#bd4b43','ÖBB':'#c7584a','VR Group':'#187e73','Vy Group':'#439b82','Moventia':'#8b67a5','CIÉ':'#3299a7','Egged Mobility':'#b97c2f','Tide':'#397a95','Boreal':'#9d6b3b','Sporveien':'#4f8c68','Mutares':'#c18854','Transport UK Group':'#645fa7','Wiener Stadtwerke':'#b56669','Swiss Post':'#c4a32d','Hitachi Rail':'#4a7f9f','AVM Group':'#5f8e72','Grupo Barraqueiro':'#4a8b98','Connect Bus':'#8d6eaf'};
function colorFor(group){if(!group)return '#67737d';if(COLORS[group])return COLORS[group];let x=0;for(const c of group)x=(x*31+c.charCodeAt(0))>>>0;return `hsl(${x%360} 49% 44%)`;}
const pinShape=(color,opacity,large=false,branded=false)=>{
  const ring=large?`<circle cx="14" cy="12" r="11.5" fill="none" stroke="${color}" stroke-opacity=".2" stroke-width="3"/>`:'';
  return `<svg viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M14 2C6.8 2 1.5 7.1 1.5 14c0 9.7 12.5 21.5 12.5 21.5S26.5 23.7 26.5 14C26.5 7.1 21.2 2 14 2Z" fill="${color}" fill-opacity="${opacity}" stroke="#fff" stroke-width="1.7"/>${ring}${branded?'':`<circle cx="14" cy="13.4" r="5.2" fill="#fff" fill-opacity="${large?.98:.86}"/><circle cx="14" cy="13.4" r="2.4" fill="${color}" fill-opacity="${opacity}"/>`}</svg>`;
};
function logoFor(o){
  if(!state.showLogos||o.type==='candidate')return null;
  // Prefer a known operator's own mark; otherwise use its identified parent-group mark.
  const rule=state.logoRules.find(item=>item.re.test(o.name));
  return rule?.src||state.logos.groups?.[o.group]||null;
}
const pinIcon=o=>{
  const independent=!o.group,head=o.type==='hq';
  const size=state.showLogos?(head?49:independent?43:42):(head?30:independent?24:22);
  const alpha=head?1:(independent?.96:.58),height=Math.round(size*1.36),brand=logoFor(o);
  const diameter=Math.round(size*.69),top=Math.round(size*.49-diameter/2);
  const disc=state.showLogos?`<span class="brand-pin-disc" style="width:${diameter}px;height:${diameter}px;left:${Math.round((size-diameter)/2)}px;top:${top}px;opacity:${head?1:independent?.98:.9}">${brand?`<img src="${ESC(brand)}" alt="">`:`<b style="color:${colorFor(o.group)}">${ESC(o.name.trim()[0]||'•')}</b>`}</span>`:'';
  const html=`<div class="thumb-pin ${head?'is-hq':''} ${state.showLogos?'brand-pin':''}" style="width:${size}px;height:${height}px">${pinShape(colorFor(o.group),alpha,head,state.showLogos)}${disc}</div>`;
  return L.divIcon({html,className:'employer-marker',iconSize:[size,height],iconAnchor:[size/2,height]});
};
const candidateIcon=()=>L.divIcon({html:`<div class="thumb-pin" style="width:24px;height:33px">${pinShape('#149e87',.98)}</div>`,className:'candidate-marker',iconSize:[24,33],iconAnchor:[12,33]});
let state={all:[],candidates:[],excluded:{groups:new Set(),countries:new Set(),modes:new Set()},hqOnly:false,showCandidates:true,showLogos:true,logos:{groups:{}},logoRules:[],query:'',selectedId:null,limit:65,filtered:[],statuses:{},notes:{},map:null,cluster:null,candidateLayer:null,markers:new Map(),summary:null,sector:'public',regionsLayer:null,departmentsLayer:null,regionalLabels:null,departmentLabels:null,departmentFeatures:[],regionForDepartment:{}};
try{state.statuses=JSON.parse(localStorage.getItem('fleetbridge_atlas_statuses')||'{}')||{};state.notes=JSON.parse(localStorage.getItem('fleetbridge_atlas_notes')||'{}')||{};state.showLogos=localStorage.getItem('fleetbridge_atlas_logos')!=='false';}catch{}
const noteTimers=new Map();
function persist(id,updates={}){
  // LocalStorage is only a fallback; the PC's SQLite store owns shared notes.
  try{localStorage.setItem('fleetbridge_atlas_statuses',JSON.stringify(state.statuses));localStorage.setItem('fleetbridge_atlas_notes',JSON.stringify(state.notes));}catch{}
  if(!id)return;
  const write=()=>fetch('/api/atlas-prospect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,updates})})
    .then(r=>{if(!r.ok)throw Error('Prospect save was rejected.');}).catch(()=>notice('Could not sync prospect changes to the PC database. Reopen FleetBridge and retry.'));
  if(Object.hasOwn(updates,'notes')){
    clearTimeout(noteTimers.get(id));noteTimers.set(id,setTimeout(write,500));
  }else void write();
}
function notice(message){$('notice').hidden=false;$('notice').textContent=message;}
function groupLabel(group){return group||'Independent / local';}
function groupCount(){return new Set(state.all.filter(o=>o.group).map(o=>o.group)).size;}
function countryFlag(c){return /^[A-Z]{2}$/.test(c)?[...c].map(x=>String.fromCodePoint(x.charCodeAt(0)+127397)).join(''):'';}
function csvValue(v){const x=String(v??'');return /[",\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x;}
function dl(filename,rows){const blob=new Blob([rows],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),300);}
function readCsv(text){
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(field);field='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field='';}else field+=c;}
  if(field||row.length){row.push(field);rows.push(row);}
  return rows;
}
async function importLocations(text){
  const csv=readCsv(text.replace(/^\ufeff/,''));if(csv.length<2)throw Error('The CSV must contain a header and at least one data row.');
  const keys=csv[0].map(x=>norm(x).replace(/[^a-z0-9]/g,''));
  const pick=(row,...names)=>{for(const n of names){const i=keys.indexOf(n);if(i>=0)return (row[i]||'').trim();}return '';};
  if(!keys.includes('name'))throw Error('CSV requires a name column. Download the template for the supported fields.');
  const coordinates=new Map(state.all.map(o=>[norm(o.city)+'|'+o.code,{lat:o.lat,lng:o.lng}]));
  let added=0,skipped=0;
  for(const row of csv.slice(1)){
    const name=pick(row,'name');const city=pick(row,'city');const codeRaw=pick(row,'country','countrycode','code').toUpperCase();
    const code=COUNTRIES[codeRaw]?codeRaw:Object.keys(COUNTRIES).find(k=>norm(COUNTRIES[k])===norm(codeRaw));
    const latRaw=pick(row,'latitude','lat'),lngRaw=pick(row,'longitude','lng','lon');
    const coords=(latRaw&&lngRaw&&Number.isFinite(+latRaw)&&Number.isFinite(+lngRaw))?{lat:+latRaw,lng:+lngRaw}:coordinates.get(norm(city)+'|'+code);
    if(!name||!code||!coords){skipped++;continue;}
    const typeInput=norm(pick(row,'type'));
    const type=['candidate','hq','depot'].includes(typeInput)?typeInput:'operator';
    const obj={id:'custom-'+Math.random().toString(36).slice(2,11),name,city,code,country:COUNTRIES[code],lat:coords.lat,lng:coords.lng,group:pick(row,'group'),mode:pick(row,'mode')||'bus',type,source:pick(row,'source','sourceurl','linkedin'),rank:null,licences:null,origin:'manual',precision:latRaw&&lngRaw?'user supplied coordinates':'city centre (approximate)',confidence:'manual'};
    if(type==='candidate')state.candidates.push(obj);else state.all.push(obj);
    added++;
  }
  const allCustom=state.all.filter(x=>x.origin==='manual').concat(state.candidates.filter(x=>x.origin==='manual'));
  if(allCustom.length){
    const response=await fetch('/api/atlas-custom',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:allCustom})});
    if(!response.ok)throw Error('Atlas pin import could not be saved to the shared PC database.');
  }
  if(added){renderFacets();renderAll();}
  notice(`${added} local location${added===1?'':'s'} imported${skipped?` · ${skipped} skipped (missing city match or coordinates)`:''}. No remote upload was made.`);
}
const filtered=()=>{
  const q=norm(state.query);
  return state.all.filter(o=>{
    if(state.hqOnly&&o.type!=='hq')return false;
    if(state.sector!=='all'&&(o.sector||'public')!==state.sector)return false;
    if(state.excluded.groups.has(o.group||'__independent__'))return false;
    if(state.excluded.countries.has(o.code))return false;
    if(state.excluded.modes.has(o.mode))return false;
    if(q&&!norm([o.name,o.city,o.country,o.group,o.mode].join(' ')).includes(q))return false;
    return true;
  }).sort((a,b)=>{
    if(a.type==='hq'&&b.type!=='hq')return -1;
    if(b.type==='hq'&&a.type!=='hq')return 1;
    if(a.licences||b.licences)return (b.licences||0)-(a.licences||0);
    return a.name.localeCompare(b.name);
  });
};
function renderFacets(){
  const box=$('facets');box.replaceChildren();const active=state.all.filter(o=>state.sector==='all'||(o.sector||'public')===state.sector);
  const definitions=[
    {id:'groups',title:'Ownership group',values:[...new Set(active.map(o=>o.group||'__independent__'))].sort((a,b)=>a==='__independent__'?-1:b==='__independent__'?1:a.localeCompare(b)),label:x=>x==='__independent__'?'Independent / local':x},
    {id:'countries',title:'Country / market',values:[...new Set(active.map(o=>o.code))].sort((a,b)=>COUNTRIES[a].localeCompare(COUNTRIES[b])),label:x=>`${countryFlag(x)} ${COUNTRIES[x]}`},
    {id:'modes',title:'Transport mode',values:[...new Set(active.map(o=>o.mode))].sort(),label:x=>x==='multimodal'?'Multimodal':x[0].toUpperCase()+x.slice(1)}
  ];
  definitions.forEach((f,index)=>{
    const d=document.createElement('details');d.className='facet';if(index===0)d.open=true;
    const summary=document.createElement('summary');summary.innerHTML=`<span>${f.title}</span><span class="sum-end"><span class="selected-count"></span></span>`;d.append(summary);
    const list=document.createElement('div');list.className='facet-list';
    for(const v of f.values){
      const label=document.createElement('label');label.className='facet-choice';
      const input=document.createElement('input');input.type='checkbox';input.checked=!state.excluded[f.id].has(v);input.setAttribute('aria-label',f.label(v));
      input.addEventListener('change',()=>{if(input.checked)state.excluded[f.id].delete(v);else state.excluded[f.id].add(v);refreshFacetCount();renderAll();});
      const count=active.filter(o=>(f.id==='groups'?(o.group||'__independent__'):f.id==='countries'?o.code:o.mode)===v).length;
      label.append(input);
      if(f.id==='groups'){const sw=document.createElement('span');sw.className='swatch';sw.style.background=v==='__independent__'?'#67737d':colorFor(v);label.append(sw);}
      const name=document.createElement('span');name.className='name';name.textContent=f.label(v);label.append(name);
      const n=document.createElement('span');n.className='count';n.textContent=count;label.append(n);list.append(label);
    }
    d.append(list);
    const controls=document.createElement('div');controls.className='facet-controls';
    for(const [word,all] of [['Select all',true],['Clear',false]]){
      const button=document.createElement('button');button.type='button';button.textContent=word;
      button.addEventListener('click',()=>{f.values.forEach(v=>all?state.excluded[f.id].delete(v):state.excluded[f.id].add(v));list.querySelectorAll('input').forEach(inp=>inp.checked=all);refreshFacetCount();renderAll();});controls.append(button);
    }
    d.append(controls);box.append(d);
  });
  refreshFacetCount();
}
function refreshFacetCount(){
  for(const [id,title] of [['groups','groups'],['countries','countries'],['modes','modes']]){
    const idx={groups:0,countries:1,modes:2}[id];const node=$('facets').children[idx];if(!node)continue;
    const total=node.querySelectorAll('input').length,not=state.excluded[id].size;
    node.querySelector('.selected-count').textContent=not===0?'All':`${Math.max(0,total-not)} / ${total}`;
  }
}
function polygonContains(point,coords){
  if(!Array.isArray(coords))return false;
  const [x,y]=point;
  const insideRing=ring=>{let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[i],b=ring[j];if(((a[1]>y)!==(b[1]>y))&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
  }return inside;};
  return coords.some(poly=>poly.length>0&&insideRing(poly[0])&&!poly.slice(1).some(insideRing));
}
function updateGeographyLayers(){
  const m=state.map;if(!m)return;
  const z=m.getZoom();
  if(state.regionsLayer){if($('showRegions').checked){if(!m.hasLayer(state.regionsLayer))m.addLayer(state.regionsLayer);}else m.removeLayer(state.regionsLayer);}
  if(state.departmentsLayer){if($('showDepartments').checked&&z>=6){if(!m.hasLayer(state.departmentsLayer))m.addLayer(state.departmentsLayer);}else m.removeLayer(state.departmentsLayer);}
  if(state.regionalLabels){if($('showRegions').checked&&z>=5&&z<9){if(!m.hasLayer(state.regionalLabels))m.addLayer(state.regionalLabels);}else m.removeLayer(state.regionalLabels);}
  if(state.departmentLabels){if($('showDepartments').checked&&z>=8){if(!m.hasLayer(state.departmentLabels))m.addLayer(state.departmentLabels);}else m.removeLayer(state.departmentLabels);}
  const c=m.getCenter(),point=[c.lng,c.lat];
  const hit=state.departmentFeatures.find(f=>polygonContains(point,f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates));
  const breadcrumb=$('geoBreadcrumb');if(hit){const dept=hit.properties.code,reg=state.regionForDepartment[dept]||'France';breadcrumb.textContent=`France / ${reg} / ${hit.properties.name} (${dept})`;}
  else breadcrumb.textContent='France / pan or zoom to a French department';
}
function loadFrenchBoundaries(m){
  Promise.all([fetch('france-regions.json').then(r=>r.json()),fetch('france-departments.json').then(r=>r.json())]).then(([regions,depts])=>{
    state.departmentFeatures=depts.features;
    for(const f of regions.features)for(const code of f.properties.codes||[])state.regionForDepartment[code]=f.properties.name;
    m.createPane('frenchBoundaries');m.getPane('frenchBoundaries').style.zIndex=440;m.getPane('frenchBoundaries').style.pointerEvents='none';
    const boundaryStyle={color:'#319a9b',weight:1.2,opacity:.52,fillOpacity:0};
    state.regionsLayer=L.geoJSON(regions,{pane:'frenchBoundaries',style:()=>({color:'#248f91',weight:2,opacity:.76}),interactive:false});
    state.departmentsLayer=L.geoJSON(depts,{pane:'frenchBoundaries',style:()=>boundaryStyle,interactive:false});
    const label=(txt,klass)=>L.divIcon({html:`<span>${ESC(txt)}</span>`,className:klass,iconSize:[140,20],iconAnchor:[70,10]});
    state.regionalLabels=L.layerGroup(regions.features.filter(x=>Array.isArray(x.properties.label)).map(f=>L.marker(f.properties.label,{icon:label(f.properties.name,'region-label'),interactive:false,keyboard:false})));
    state.departmentLabels=L.layerGroup(depts.features.filter(x=>Array.isArray(x.properties.label)).map(f=>L.marker(f.properties.label,{icon:label(`${f.properties.name} (${f.properties.code})`,'department-label'),interactive:false,keyboard:false})));
    updateGeographyLayers();
  }).catch(e=>notice('French region and department outlines unavailable: '+e.message));
}
function initMap(){
  const m=L.map('map',{zoomControl:false,worldCopyJump:true,preferCanvas:false,minZoom:2,maxZoom:17}).setView([50.7,10.8],4);
  L.control.zoom({position:'bottomright'}).addTo(m);
  // Natural Earth CC0 vector outlines are shipped with the app. No API keys, tile quotas or
  // third-party map servers are needed for pan/zoom or for the employer-marker layers.
  m.attributionControl.addAttribution('Country shapes: <a href="https://www.naturalearthdata.com/">Natural Earth</a> · Cities: <a href="https://www.geonames.org/">GeoNames</a>');
  m.createPane('countryLabels');m.getPane('countryLabels').style.zIndex=430;m.getPane('countryLabels').style.pointerEvents='none';
  fetch('europe-base.geojson').then(r=>r.json()).then(data=>{
    L.geoJSON(data,{interactive:false,style:()=>({weight:1,color:'#bbcdd1',fillColor:'#f6f8f7',fillOpacity:1,opacity:1})}).addTo(m);
    for(const f of data.features){
      const {name,code,labelLat,labelLng}=f.properties;
      if(!Number.isFinite(labelLat)||!Number.isFinite(labelLng)||!COUNTRIES[code])continue;
      const label=L.divIcon({html:`<span>${ESC(name)}</span>`,className:'country-label',iconSize:[105,18],iconAnchor:[52,9]});
      L.marker([labelLat,labelLng],{icon:label,pane:'countryLabels',interactive:false,keyboard:false}).addTo(m);
    }
  }).catch(e=>notice(`Country outlines unavailable: ${e.message}. Employer locations still work.`));
  state.map=m;
  loadFrenchBoundaries(m);m.on('zoomend moveend',updateGeographyLayers);
  state.cluster=L.markerClusterGroup({maxClusterRadius:42,showCoverageOnHover:false,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,disableClusteringAtZoom:11,iconCreateFunction:cluster=>{
    const n=cluster.getChildCount(),size=n>100?47:n>20?41:35;
    return L.divIcon({html:`<div class="pin-cluster" style="width:${size}px;height:${size}px">${n}</div>`,className:'cluster-root',iconSize:[size,size]});
  }});m.addLayer(state.cluster);
  state.candidateLayer=L.markerClusterGroup({maxClusterRadius:46,showCoverageOnHover:false,spiderfyOnMaxZoom:true,zoomToBoundsOnClick:true,disableClusteringAtZoom:13,iconCreateFunction:cluster=>{
    const n=cluster.getChildCount(),size=n>99?48:n>20?42:36;
    return L.divIcon({html:`<div class="candidate-pin-cluster" style="width:${size}px;height:${size}px">${n}</div>`,className:'candidate-cluster-root',iconSize:[size,size]});
  }}).addTo(m);
  new ResizeObserver(()=>m.invalidateSize({pan:false})).observe($('map'));
}
function renderMap(){
  state.cluster.clearLayers();state.markers.clear();
  const markers=[];
  for(const o of state.filtered){
    const marker=L.marker([o.lat,o.lng],{icon:pinIcon(o),title:o.name,keyboard:true});
    marker.on('click',()=>select(o.id));marker.bindTooltip(`${ESC(o.name)} · ${ESC(o.city)}`,{direction:'top',offset:[0,-23]});
    markers.push(marker);state.markers.set(o.id,marker);
  }
  state.cluster.addLayers(markers);
  state.candidateLayer.clearLayers();
  if(state.showCandidates){for(const o of state.candidates){const marker=L.marker([o.lat,o.lng],{icon:candidateIcon(),title:o.name});marker.bindTooltip(`${ESC(o.name)} · ${ESC(o.city||'Candidate location')}`,{direction:'top',offset:[0,-18]});marker.on('click',()=>select(o.id));state.candidateLayer.addLayer(marker);}}
  $('mapShown').textContent=state.filtered.length+(state.showCandidates?state.candidates.length:0);
}
let unmappedDesktopCandidates=0;
async function loadDesktopCandidates(){
  try{
    const response=await fetch('/api/candidates',{cache:'no-store'});if(!response.ok)throw Error(`Local API: HTTP ${response.status}`);
    const payload=await response.json();
    const {mapped,unmapped}=await FBAtlasCandidates.build(payload.records||[],state.all);
    unmappedDesktopCandidates=unmapped;
    const imported=state.candidates.filter(o=>o.origin!=='desktop');
    state.candidates=[...imported,...mapped];
    $('candidateCoverage').textContent=`${mapped.length} local candidate pin${mapped.length===1?'':'s'} · ${unmapped} unresolved`;
    if(state.map)renderMap();
    if(state.selectedId?.startsWith('desktop-candidate:'))renderInspector();
  }catch(error){$('candidateCoverage').textContent='Candidate sync unavailable';console.warn('Local candidates could not be mapped:',error.message);}
}
function renderMetrics(){
  $('metricVisible').textContent=state.filtered.length.toLocaleString('en-US');
  $('metricCountries').textContent=new Set(state.filtered.map(o=>o.code)).size;
  $('metricGroups').textContent=new Set(state.filtered.filter(o=>o.group).map(o=>o.group)).size;
  $('metricProspects').textContent=Object.values(state.statuses).filter(x=>x&&x!=='New').length;
  $('resultCount').textContent=state.filtered.length.toLocaleString('en-US');
}
function renderList(){
  const list=$('resultsList');list.replaceChildren();
  for(const o of state.filtered.slice(0,state.limit)){
    const row=document.createElement('button');row.type='button';row.className=`result-item ${o.id===state.selectedId?'selected':''}`;
    const c=colorFor(o.group);const status=state.statuses[o.id];
    row.innerHTML=`<span class="result-swatch" style="background:${c};opacity:${o.type==='hq'?1:o.group?.6:.98}"></span><span class="result-main"><span class="result-name">${ESC(o.name)}</span><span class="result-meta">${ESC(o.city)} · ${ESC(groupLabel(o.group))}</span></span>${status&&status!=='New'?'<span class="result-tag">'+ESC(status)+'</span>':''}<span class="result-arrow">›</span>`;
    row.addEventListener('click',()=>select(o.id));list.append(row);
  }
  if(!state.filtered.length)list.innerHTML='<div class="no-results">No employers match these filters.<br>Try another country, group or search.</div>';
  $('showMore').hidden=state.filtered.length<=state.limit;
}
function renderAll(){
  state.filtered=filtered();if(state.selectedId&&!state.filtered.some(o=>o.id===state.selectedId)&&!state.candidates.some(o=>o.id===state.selectedId))state.selectedId=null;
  renderMetrics();renderList();renderMap();renderInspector();
}
function linkAllowed(url){try{const u=new URL(url);return /^https?:$/.test(u.protocol)?u.href:null;}catch{return null;}}
const row=(label,value)=>`<div class="detail-row"><label>${ESC(label)}</label><strong>${ESC(value)}</strong></div>`;
function select(id){
  const o=state.all.find(x=>x.id===id)||state.candidates.find(x=>x.id===id);if(!o)return;
  state.selectedId=id;renderList();renderInspector();
  state.map.flyTo([o.lat,o.lng],Math.max(state.map.getZoom(),8),{duration:.65});
}
function renderInspector(){
  const body=$('inspectorBody');const o=state.all.find(x=>x.id===state.selectedId)||state.candidates.find(x=>x.id===state.selectedId);
  $('inspectorIndex').textContent=o?o.code:'';
  if(!o){body.innerHTML='<div class="empty-inspector"><div class="empty-icon">⌁</div><h3>Select an employer</h3><p>Choose a colored thumbtack or a company in the directory to inspect its operator identity, ownership network and outreach status.</p><div class="empty-rule"></div><span>OPERATING COMPANIES · NOT BUS STOPS</span></div>';return;}
  const isCand=o.type==='candidate';const c=isCand?'#149e87':colorFor(o.group);const independent=!o.group;
  if(isCand){
    const link=linkAllowed(o.source);
    body.innerHTML=`<div class="inspector-hero"><div class="hero-color" style="background:#149e87"><span>◉</span></div><h3 class="company-name">${ESC(o.name)}</h3><div class="hero-location">${ESC([o.city,o.country].filter(Boolean).join(', ')||'Workplace location')}</div><div class="tag-row"><span class="detail-tag group-tag">Candidate</span><span class="detail-tag">${ESC(o.status||'New')}</span></div></div>
    <div class="inspector-section"><div class="detail-title">PROFILE</div>${row('Role / headline',o.headline||'Not yet assessed')}${row('Recruitment stage',o.status||'New')}${row('Source',o.origin==='desktop'?'Shared FleetBridge candidate database':'Manual candidate import')}</div>
    <div class="inspector-section"><div class="detail-title">GEOGRAPHIC EVIDENCE</div><p class="precision-warning">${ESC(o.precision||'Location is approximate')}. This pin is evidence of a reported city or recorded workplace; it is <b>not</b> a verified residence or proof of relocation.</p>${o.locationEvidence?row('Recorded location',o.locationEvidence):''}</div>
    <div class="inspector-section"><div class="detail-title">CANDIDATE ACTIONS</div><div class="action-column">${link?`<a class="action-link strong" href="${ESC(link)}" rel="noopener" target="_blank">Open profile ↗</a>`:''}${o.origin==='desktop'?'<button class="action-link" id="reviewInCRM" type="button">Open candidate in CRM ↗</button>':''}</div></div>`;
    $('reviewInCRM')?.addEventListener('click',()=>window.parent.postMessage({type:'FLEETBRIDGE_OPEN_CANDIDATE',url:o.source},location.origin));
    return;
  }
  const type=isCand?'Candidate location':o.type==='hq'?'Group headquarters':o.type==='depot'?'Operating / maintenance site':independent?'Independent / local employer':'Group operator / affiliate';
  const source=linkAllowed(o.source);
  const sourceName=o.sector==='heavy'?'Official company website':o.origin==='utpf'?'UTPF member directory':o.origin==='manual'?'User import':o.source?.includes('transbus')?'Transbus ranking':'Curated operator listing';
  const googleQ=encodeURIComponent(`${o.name} ${o.city} emploi recrutement`);
  const linkedInQ=encodeURIComponent(`${o.name} ${o.city}`);
  const brand=logoFor(o);
  body.innerHTML=`<div class="inspector-hero"><div class="hero-color" style="background:${c}">${brand?`<img src="${ESC(brand)}" alt="${ESC(o.group||o.name)} identification logo">`:`<span>${ESC(o.name.trim()[0]||'•')}</span>`}</div><h3 class="company-name">${ESC(o.name)}</h3><div class="hero-location"><svg viewBox="0 0 24 24"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.7"/></svg>${ESC(o.city)}, ${ESC(o.country)}</div><div class="tag-row"><span class="detail-tag group-tag">${ESC(type)}</span><span class="detail-tag">${ESC(o.mode)}</span></div></div>
    <div class="inspector-section"><div class="detail-title">OWNERSHIP STRUCTURE</div><div class="group-identity"><span class="group-bar" style="background:${c}"></span><div><span>${independent?'NO CONFIRMED PARENT GROUP':'PARENT NETWORK'}</span><strong>${ESC(groupLabel(o.group))}</strong></div></div>${row('Employer type',type)}${row('Market',`${countryFlag(o.code)} ${o.country}`)}${o.rank?row('Transbus fleet rank',`#${o.rank} · ${o.licences} licences`):''}${row('Sector',o.sector==='heavy'?'Heavy trucks / Poids lourds':'Public transportation')}${o.address?row('Reported address',o.address):''}${o.activity?row('Activity',o.activity):''}${row('Data source',sourceName)}</div>
    <div class="inspector-section"><div class="detail-title">LOCATION RELIABILITY</div><p class="precision-warning">${o.precision==='user supplied coordinates'?'Coordinates were supplied in your imported CSV. Verify the address before visiting.':'Pin is positioned at the <b>city centre</b>. It does not confirm a headquarters building, maintenance depot or live vacancy.'}</p></div>
    <div class="inspector-section"><div class="detail-title">OUTREACH WORKSPACE</div><label class="outreach-label" for="outreachStatus">Prospect status</label><select id="outreachStatus" class="outreach-select"><option>New</option><option>Researching</option><option>Shortlisted</option><option>Contacted</option><option>In discussion</option><option>Contract opportunity</option><option>Not relevant</option></select><textarea id="recordNote" class="note-input" placeholder="Record your contact, next action, or hiring information…" aria-label="Private note">${ESC(state.notes[o.id]||'')}</textarea><p class="save-note">Saved to FleetBridge's shared local PC database</p><div class="action-column"><a class="action-link strong" target="_blank" rel="noopener" href="https://www.google.com/search?q=${googleQ}">Find recruitment information <span>↗</span></a><a class="action-link" target="_blank" rel="noopener" href="https://www.linkedin.com/jobs/search/?keywords=${linkedInQ}">Search LinkedIn jobs <span>↗</span></a>${source?`<a class="action-link" target="_blank" rel="noopener" href="${ESC(source)}">Open listing source <span>↗</span></a>`:''}</div></div>`;
  const status=$('outreachStatus');status.value=state.statuses[o.id]||'New';
  status.addEventListener('change',()=>{state.statuses[o.id]=status.value;persist(o.id,{status:status.value});renderMetrics();renderList();});
  $('recordNote').addEventListener('input',e=>{state.notes[o.id]=e.target.value;persist(o.id,{notes:e.target.value});});
}
function fitFiltered(){
  const a=state.filtered;if(!a.length)return;
  if(a.length===1){state.map.flyTo([a[0].lat,a[0].lng],9);return;}
  const bounds=L.latLngBounds(a.map(o=>[o.lat,o.lng]));state.map.fitBounds(bounds,{padding:[32,32],maxZoom:9});
}
function setMapOnly(enabled){
  document.body.classList.toggle('map-only',enabled);
  const embedded=document.documentElement.classList.contains('embedded');
  const btn=$('mapFullscreen');btn.setAttribute('aria-pressed',String(enabled));
  btn.innerHTML=enabled?'<span class="fullscreen-symbol">⤡</span> Exit focus':'<span class="fullscreen-symbol">⛶</span> '+(embedded?'Focus map':'Fullscreen');
  btn.title=enabled?'Return to the Atlas filters and inspector':embedded?'Focus the map while keeping FleetBridge navigation':'Use a full-viewport map with no page scrolling';
  requestAnimationFrame(()=>{state.map.invalidateSize({pan:false});setTimeout(()=>state.map.invalidateSize({pan:false}),150);});
}
async function toggleMapOnly(){
  const next=!document.body.classList.contains('map-only');setMapOnly(next);
  // A focused embedded map must not cover FleetBridge's global navigation.
  if(document.documentElement.classList.contains('embedded'))return;
  if(next){try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch{ /* CSS full viewport remains available */ }}
  else if(document.fullscreenElement){try{await document.exitFullscreen();}catch{}}
}
function updateSectorCoverage(){
  const hint=$('sectorCoverage');
  // Display the limitation only while viewing the incomplete heavy-truck directory.
  hint.hidden=state.sector!=='heavy';
}
function setupEvents(){
  $('goCRM').addEventListener('click',()=>{
    if(window.parent!==window)window.parent.postMessage({type:'FLEETBRIDGE_SHOW_CRM'},location.origin);
    else window.location.assign('/#/candidates');
  });
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==window.parent)return;
    if(event.data?.type==='FLEETBRIDGE_REFRESH_CANDIDATES')void loadDesktopCandidates();
    if(event.data?.type==='FLEETBRIDGE_SELECT_EMPLOYER' && typeof event.data.id==='string'){
      const sector=event.data.sector==='heavy'?'heavy':'public';state.sector=sector;$('sectorMode').value=sector;state.excluded={groups:new Set(),countries:new Set(),modes:new Set()};renderFacets();renderAll();updateSectorCoverage();select(event.data.id);
    }
    if(event.data?.type==='FLEETBRIDGE_PRESENTATION'){
      document.documentElement.dataset.theme='light';
      if(event.data.active&&state.map)requestAnimationFrame(()=>{
        state.map.invalidateSize({pan:false});
        setTimeout(()=>state.map.invalidateSize({pan:false}),180);
      });
    }
  });
  $('sectorMode').addEventListener('change',e=>{state.sector=e.target.value;state.excluded={groups:new Set(),countries:new Set(),modes:new Set()};state.selectedId=null;renderFacets();renderAll();updateSectorCoverage();});
  for(const id of ['showRegions','showDepartments'])$(id).addEventListener('change',updateGeographyLayers);
  $('search').addEventListener('input',e=>{state.query=e.target.value;state.limit=65;renderAll();});
  $('hqOnly').addEventListener('change',e=>{state.hqOnly=e.target.checked;renderAll();});
  $('showCandidates').addEventListener('change',e=>{state.showCandidates=e.target.checked;renderAll();});
  $('resetFilters').addEventListener('click',()=>{state.excluded={groups:new Set(),countries:new Set(),modes:new Set()};state.query='';state.hqOnly=false;$('search').value='';$('hqOnly').checked=false;state.limit=65;renderFacets();renderAll();});
  $('fitAll').addEventListener('click',fitFiltered);$('mapHome').addEventListener('click',()=>state.map.flyTo([50.7,10.8],4,{duration:.65}));
  $('mapFullscreen').addEventListener('click',toggleMapOnly);
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&document.body.classList.contains('map-only'))setMapOnly(false);});
  $('logoToggle').addEventListener('click',()=>{
    state.showLogos=!state.showLogos;try{localStorage.setItem('fleetbridge_atlas_logos',String(state.showLogos));}catch{}
    const btn=$('logoToggle');btn.setAttribute('aria-pressed',String(state.showLogos));btn.innerHTML=`<span class="logo-toggle-dot">◉</span> Logos ${state.showLogos?'on':'off'}`;
    renderMap();renderInspector();
  });
  $('showMore').addEventListener('click',()=>{state.limit+=65;renderList();});
  $('downloadTemplate').addEventListener('click',()=>dl('fleetbridge-location-import-template.csv','name,city,country,latitude,longitude,group,mode,type,source\n'));
  $('exportCsv').addEventListener('click',()=>{
    const cols=['name','city','country','latitude','longitude','group','mode','type','source','licences','prospect_status','notes'];
    const rows=state.filtered.map(o=>[o.name,o.city,o.code,o.lat,o.lng,o.group,o.mode,o.type,o.source,o.licences??'',state.statuses[o.id]||'New',state.notes[o.id]||''].map(csvValue).join(','));
    dl('fleetbridge-europe-operators.csv',[cols.join(','),...rows].join('\n')+'\n');
  });
  $('fileImport').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{await importLocations(await f.text());}catch(err){notice(`Import failed: ${err.message}`);}e.target.value='';});
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('map-only')){setMapOnly(false);if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});}
    if(e.key==='/'&&!document.body.classList.contains('map-only')&&!['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)){e.preventDefault();$('search').focus();}
  });
}
async function main(){
  try{
    const [response,manifest,prospects,customPins]=await Promise.all([
      fetch('data.json'),
      fetch('logo-manifest.json').then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/api/atlas-prospects').then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/api/atlas-custom').then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if(!response.ok)throw Error('Could not load employer data');
    const {operators,summary}=await response.json();const heavy=await fetch('heavy-vehicles.json').then(r=>r.ok?r.json():{records:[]}).catch(()=>({records:[]}));
    state.all=[...operators.map(o=>({...o,sector:'public'})),...(heavy.records||[])];state.summary=summary;
    $('sectorCoverage').textContent=`${(heavy.records||[]).length} sourced heavy-truck entities · directory incomplete; public atlas contains ${operators.length} operator records.`;
    if(prospects){state.statuses=prospects.statuses||{};state.notes=prospects.notes||{};}
    if(manifest){state.logos=manifest;state.logoRules=(manifest.operators||[]).map(item=>{try{return{re:new RegExp(item.pattern,'i'),src:item.src};}catch{return null;}}).filter(Boolean);}
    $('logoToggle').setAttribute('aria-pressed',String(state.showLogos));
    $('logoToggle').innerHTML=`<span class="logo-toggle-dot">◉</span> Logos ${state.showLogos?'on':'off'}`;
    for(const item of customPins?.records||[]){if(item.type==='candidate')state.candidates.push(item);else if(!state.all.some(x=>x.id===item.id))state.all.push(item);}
    initMap();setupEvents();renderFacets();renderAll();updateSectorCoverage();
    void loadDesktopCandidates();
    setInterval(()=>{if(!document.hidden)void loadDesktopCandidates();},30000);
    // Do not show a startup success banner: the map itself communicates readiness.
    // Surface only actionable errors, imports, and user-requested feedback.
  }catch(e){notice(`Map could not initialize: ${e.message}. Try reloading.`);console.error(e);}
}
main();
