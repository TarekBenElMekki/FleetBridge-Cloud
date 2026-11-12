/* Full-page candidate review: the capture sidebar is intentionally read-only. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id),SELECT_KEY='fleetbridgeDashboardSelectionV1';
  const statusValues=new Set(['new','reviewing','shortlisted','contacted','interview','rejected']);
  const workMap={citizenshipGroup:'citizenshipGroup',workRights:'workRights',residenceStatus:'residence',
    jobTitleFrance:'jobTitle',jobRegionFrance:'jobRegion',contractType:'contractType',employerApplies:'employerApplies',
    shortageRoute:'shortageRoute',publicationRoute:'publicationRoute',driverQualification:'driverQualification'};
  let rows=[],selectedUrl='',draft=null,dirty=false,initialSelection='';
  function message(text,error=false){$('reviewFeedback').textContent=text;$('reviewFeedback').classList.toggle('error',error);}
  function candidate(){return rows.find(r=>FB.canonicalUrl(r.url)===selectedUrl);}
  function newRole(){return {id:`review-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,title:'',company:'',
    startDate:'',endDate:'',current:false,approximate:false,locationRaw:'',geo:null,source:'manual_review'};}
  function createDraft(row){
    const imp=row.profileImport||{},cap=row.profileCapture||{},fields={};
    for(const key of FB.FIELDS)fields[key]=imp.importedAt?(imp[key]||cap.fields?.[key]||''):(cap.fields?.[key]||imp[key]||'');
    const roles=FBCareer.mergeRoles(imp.experienceRoles||[],cap.roles||[]);
    if(!roles.length&&fields.experience)roles.push(...FBCareer.parseExperience(fields.experience));
    return {fields,roles,status:statusValues.has(row.status)?row.status:'new',notes:row.notes||'',
      mobility:imp.mobility||null,mobilityOptions:{...(imp.mobilityOptions||{})},
      workInputs:{...(imp.workInputs||{})},franceWork:imp.franceWork||null,
      captured:cap,hasApproved:Boolean(imp.importedAt),destinationGeo:null,residenceGeo:null};
  }
  function emptyPreview(){
    $('reviewTitle').textContent='Select a candidate';$('captureBadge').textContent='';
    $('responseTotal').textContent='—';$('responseEmployer').textContent='—';$('responseDuration').textContent='';
    $('responseMobility').textContent='—';$('responseWork').textContent='—';
    $('responseTypes').textContent='Experience categories will appear after profile capture.';
    $('candidateExperienceChart').replaceChildren();$('candidateDistanceChart').replaceChildren();
    $('jobChartCoverage').textContent='Select a candidate';$('hopChartCoverage').textContent='Select a candidate';
    for(const id of ['saveReview','analyzeWorkplaces','assessFrance','addJob','parseTimeline'])$(id).disabled=true;
  }
  function renderCandidateCharts(){
    if(!draft)return;
    const jobs=FBTalent.candidateJobs(draft.roles),hops=FBTalent.candidateHops(draft.roles,draft.mobility);
    $('jobChartCoverage').textContent=`${jobs.known} dated jobs${jobs.unknown?` · ${jobs.unknown} undated`:''}`;
    $('hopChartCoverage').textContent=hops.max==null?'Geographic evidence unverified':
      `Farthest pair of workplace locations: ${hops.max.toLocaleString()} km`;
    FBTalent.drawBars($('candidateExperienceChart'),jobs.bins,{
      formatValue:months=>`${months} mo`,
      emptyText:'No dated jobs captured. Open Job timeline to verify experience.'
    });
    FBTalent.drawBars($('candidateDistanceChart'),hops.bins,{
      formatValue:km=>`${km.toLocaleString()} km`,
      emptyText:'No verified successive workplace distance. Resolve job cities using Analyze workplaces.'
    });
  }
  function renderOutputs(){
    if(!draft)return emptyPreview();
    const metric=draft.roles.length?FBCareer.summary(draft.roles):FB.summarizeExperience(draft.fields.experience||'');
    $('reviewTitle').textContent=draft.fields.name||candidate()?.title||'Unnamed candidate';
    $('responseTotal').textContent=metric.totalDuration||'Unverified';
    $('responseEmployer').textContent=metric.latestCompany||'Unverified';
    $('responseDuration').textContent=metric.latestDuration||'';
    const parts=FBCareer.experienceBreakdown(draft.roles),fmt=n=>n==null?'unknown':`${Math.floor(n/12)}y ${n%12}m`;
    $('responseTypes').textContent=`Other roles: ${fmt(parts.nonInternshipMonths)} · Internships: ${fmt(parts.internshipMonths)} · Apprenticeships: ${fmt(parts.apprenticeshipMonths)}. Categories may overlap in time.`;
    $('responseMobility').textContent=draft.mobility?.label||'Not yet assessed';
    $('responseWork').textContent=draft.franceWork?.status||'Information not reviewed';
    $('mobilityExplanation').textContent=draft.mobility?.explanation||'Workplace locations are not evidence of residential moves.';
    $('workExplanation').textContent=draft.franceWork?
      `${draft.franceWork.next} ${draft.franceWork.missingInformation?.length?'Missing: '+draft.franceWork.missingInformation.join('; '):''}`:
      'Complete verified information and assess the route. No visa decision is predicted.';
    $('captureBadge').textContent=draft.captured?.capturedAt?
      `${draft.captured.roles?.length||0} jobs captured · ${draft.hasApproved?'New capture pending review':'Waiting for first review'}${draft.captured.rejectedLocation?' · location needs checking':''}`:
      draft.hasApproved?'Saved professional review':'Google discovery only';
    $('rolesCount').textContent=`(${draft.roles.length})`;
    renderCandidateCharts();
  }
  function field(id,key){
    $(id).value=draft.fields[key]||'';
  }
  function render(){
    if(!draft)return emptyPreview();
    for(const id of ['saveReview','analyzeWorkplaces','assessFrance','addJob','parseTimeline'])$(id).disabled=false;
    field('reviewName','name');field('reviewHeadline','headline');field('reviewLocation','location');field('reviewExperience','experience');
    $('reviewStatus').value=draft.status;$('reviewNotes').value=draft.notes;
    $('destinationCity').value=draft.mobilityOptions.destinationCity||'';
    $('currentResidence').value=draft.mobilityOptions.currentResidence||'';
    $('moveInterest').value=draft.mobilityOptions.interest||'unknown';
    for(const [id,key] of Object.entries(workMap)){
      $(id).value=draft.workInputs[key]??($(id).querySelector('option')?.value||'');
    }
    $('applyCapture').classList.toggle('hidden',!draft.hasApproved||!draft.captured?.fields);
    renderJobs();renderOutputs();
    if(draft.captured?.capturedAt&&!draft.hasApproved)$('profileDetails').open=true;
  }
  function setDirty(){dirty=true;message('Unsaved changes.');renderOutputs();}
  function input(host,labelText,key,role,type='text'){
    const label=document.createElement('label');label.textContent=labelText;const edit=document.createElement('input');
    edit.type=type;edit.value=role[key]||'';
    edit.addEventListener('input',()=>{
      role[key]=edit.value;if(key==='locationRaw')role.geo=null;
      if(key==='startDate'||key==='endDate')role.approximate=false;
      if(['startDate','endDate','locationRaw'].includes(key))draft.mobility=null;
      setDirty();
    });host.append(label,edit);return edit;
  }
  function renderJobs(){
    const host=$('jobRecords');host.replaceChildren();
    for(const [index,role] of draft.roles.entries()){
      const card=document.createElement('article');card.className='job-card';
      const heading=document.createElement('h4');heading.textContent=`${index+1}. ${role.title||'Unconfirmed role'}`;card.append(heading);
      input(card,'Job title','title',role);input(card,'Employer','company',role);
      const typeLabel=document.createElement('label');typeLabel.textContent='Employment type';card.append(typeLabel);
      const type=document.createElement('select');
      for(const [value,label] of [['unspecified','Not specified'],['permanent','Permanent / full time'],['contract','Contract / CDD'],['internship','Internship / stage'],['apprenticeship','Apprenticeship / alternance']]){
        const option=document.createElement('option');option.value=value;option.textContent=label;type.append(option);
      }
      type.value=FBCareer.roleType(role);
      type.addEventListener('change',()=>{role.employmentType=type.value;setDirty();});card.append(type);
      input(card,'Start month','startDate',role,'month');input(card,'End month (unless current)','endDate',role,'month');
      const current=document.createElement('label'),checked=document.createElement('input');
      current.textContent='Current job';checked.type='checkbox';checked.checked=Boolean(role.current);checked.className='short-checkbox';
      checked.addEventListener('change',()=>{role.current=checked.checked;if(role.current)role.endDate=null;draft.mobility=null;setDirty();});
      card.append(current,checked);
      input(card,'Workplace city, region, country','locationRaw',role);
      const geo=document.createElement('small');geo.textContent=role.geo?
        `${role.geo.city||'Place'} · ${role.geo.region||role.geo.countryCode||'?'} · ${role.geo.source||'reviewed'}`:
        'Workplace not resolved';card.append(geo);
      const regionLabel=document.createElement('label');regionLabel.textContent='Verified French region (optional)';card.append(regionLabel);
      const region=document.createElement('select');const unknown=document.createElement('option');unknown.value='';unknown.textContent='Unverified';region.append(unknown);
      for(const [code,name] of Object.entries(FBCareer.FR_REGIONS)){
        const choice=document.createElement('option');choice.value=code;choice.textContent=name;region.append(choice);
      }
      region.value=role.geo?.regionCode||'';
      region.addEventListener('change',()=>{
        if(!region.value){if(role.geo){role.geo.regionCode='';role.geo.region='';}}
        else{
          const old=role.geo||{},isFr=old.countryCode==='FR';
          role.geo={...old,city:old.city||FBCareer.firstCity(role.locationRaw),countryCode:'FR',
            regionCode:region.value,region:FBCareer.FR_REGIONS[region.value],
            lat:isFr?old.lat:undefined,lon:isFr?old.lon:undefined,source:'manual-reviewed'};
        }
        draft.mobility=null;setDirty();
      });card.append(region);
      const manualLabel=document.createElement('label');manualLabel.textContent='Optional verified country / coordinates';card.append(manualLabel);
      const coordinateRow=document.createElement('div');coordinateRow.className='coordinate-row';
      const country=document.createElement('input'),lat=document.createElement('input'),lon=document.createElement('input');
      country.placeholder='FR';country.value=role.geo?.countryCode||'';
      lat.placeholder='Latitude';lat.value=role.geo?.lat??'';lon.placeholder='Longitude';lon.value=role.geo?.lon??'';
      const assign=()=>{
        const cc=country.value.trim().toUpperCase(),latitude=Number(lat.value),longitude=Number(lon.value);
        if(!/^[A-Z]{2}$/.test(cc)||!lat.value.trim()||!lon.value.trim()||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)return;
        role.geo={city:FBCareer.firstCity(role.locationRaw),countryCode:cc,lat:latitude,lon:longitude,
          regionCode:cc==='FR'?region.value:'',region:cc==='FR'?(FBCareer.FR_REGIONS[region.value]||''):'',
          source:'manual-reviewed',precision:'reviewer-verified-coordinates'};
        draft.mobility=null;setDirty();
      };
      for(const el of [country,lat,lon]){el.addEventListener('change',assign);coordinateRow.append(el);}card.append(coordinateRow);
      const remove=document.createElement('button');remove.className='quiet-button danger-text';remove.textContent='Remove job';
      remove.addEventListener('click',()=>{draft.roles.splice(index,1);draft.mobility=null;setDirty();renderJobs();});card.append(remove);
      host.append(card);
    }
    $('rolesCount').textContent=`(${draft.roles.length})`;
  }
  function reconcile(records){
    rows=records;
    if(!selectedUrl){
      const fallback=records.find(r=>r.profileCapture)||records[0];
      const wanted=records.find(r=>FB.canonicalUrl(r.url)===FB.canonicalUrl(initialSelection));
      if(wanted||fallback)select((wanted||fallback).url,true);
      return;
    }
    const row=candidate();
    if(row&&!dirty){draft=createDraft(row);render();}
  }
  function select(url,force=false){
    const key=FB.canonicalUrl(url),row=rows.find(r=>FB.canonicalUrl(r.url)===key);
    if(!row)return;
    if(!force&&selectedUrl===key)return;
    if(dirty&&!force&&!confirm('Discard your unsaved candidate edits?'))return;
    selectedUrl=key;draft=createDraft(row);dirty=false;render();message(row.profileCapture?'Capture ready for review.':'Review the professional record.');
    chrome.storage.local.set({[SELECT_KEY]:key}).catch(()=>{});
    if(typeof root.render==='function')root.render();
    if(!force)$('inspector').scrollIntoView?.({behavior:'smooth',block:'start'});
  }
  function syncInputs(){
    if(!draft)return;
    for(const [id,key] of [['reviewName','name'],['reviewHeadline','headline'],['reviewLocation','location'],['reviewExperience','experience']])draft.fields[key]=$(id).value;
    draft.status=$('reviewStatus').value;draft.notes=$('reviewNotes').value;
    draft.mobilityOptions={destinationCity:$('destinationCity').value.trim(),currentResidence:$('currentResidence').value.trim(),interest:$('moveInterest').value};
    for(const [id,key] of Object.entries(workMap))draft.workInputs[key]=$(id).value;
  }
  async function analyze(){
    if(!draft)return;syncInputs();
    try{
      message('Resolving workplace cities…');
      for(const role of draft.roles){
        if(!role.locationRaw||(Number.isFinite(role.geo?.lat)&&Number.isFinite(role.geo?.lon)))continue;
        const label=role.geo?.countryCode==='FR'&&role.geo?.region?
          `${FBCareer.firstCity(role.locationRaw)}, ${role.geo.region}, France`:role.locationRaw;
        const resolved=await FBGeo.resolveLocation(label);
        if(resolved.geo)role.geo=resolved.geo;
        role.geoNote=resolved.reason;
      }
      const options=draft.mobilityOptions;
      const destination=options.destinationCity?await FBGeo.resolveLocation(options.destinationCity):{geo:null};
      const residence=options.currentResidence?await FBGeo.resolveLocation(options.currentResidence):{geo:null};
      draft.destinationGeo=destination.geo;draft.residenceGeo=residence.geo;
      draft.mobility=FBCareer.assessMobility(draft.roles,destination.geo,options.interest,residence.geo);
      dirty=true;renderJobs();renderOutputs();
      const unknown=draft.roles.filter(r=>r.locationRaw&&!r.geo).length;
      message(`Workplace history analyzed. ${unknown} unresolved locations. Save to keep results.`);
    }catch(e){message(e.message,true);}
  }
  function assessWork(){
    if(!draft)return;syncInputs();draft.franceWork=FBCareer.assessFranceWork(draft.workInputs);setDirty();
    message('Authorization checklist updated. Save to keep results.');
  }
  async function save(){
    if(!draft)return;
    try{
      syncInputs();const current=candidate();
      if(!draft.mobility)draft.mobility=FBCareer.assessMobility(draft.roles,draft.destinationGeo,draft.mobilityOptions.interest,draft.residenceGeo);
      if(!draft.franceWork)draft.franceWork=FBCareer.assessFranceWork(draft.workInputs);
      const reviewed=FB.mergeReview(current,selectedUrl,draft.fields,'full_page_human_review',{
        roles:draft.roles,mobility:draft.mobility,mobilityOptions:draft.mobilityOptions,
        workInputs:draft.workInputs,franceWork:draft.franceWork});
      const record={...reviewed,status:draft.status,notes:draft.notes,profileCapture:null};
      await FBDB.save(record);dirty=false;
      await root.reload();message('Review saved. The capture inbox is clear.');
    }catch(e){message(`Unable to save: ${e.message}`,true);}
  }
  for(const [id,key] of [['reviewName','name'],['reviewHeadline','headline'],['reviewLocation','location'],['reviewExperience','experience']]){
    $(id).addEventListener('input',()=>{if(!draft)return;draft.fields[key]=$(id).value;
      if(key==='experience'&&!draft.roles.length)renderOutputs();setDirty();});
  }
  for(const id of ['destinationCity','currentResidence','moveInterest'])$(id).addEventListener('change',()=>{
    if(!draft)return;draft.mobility=null;draft.destinationGeo=null;draft.residenceGeo=null;syncInputs();setDirty();
  });
  for(const id of Object.keys(workMap))$(id).addEventListener('change',()=>{
    if(!draft)return;syncInputs();draft.franceWork=null;setDirty();
  });
  for(const id of ['reviewStatus','reviewNotes'])$(id).addEventListener('input',()=>{if(!draft)return;syncInputs();setDirty();});
  $('parseTimeline').addEventListener('click',()=>{
    if(!draft)return;
    const text=FB.normalizeProfile({experience:$('reviewExperience').value}).experience;
    const found=FBCareer.parseExperience(text);
    if(!found.length){message('No dated roles found in the text. Add a job manually.',true);return;}
    draft.roles=FBCareer.mergeRoles(draft.roles,found);draft.fields.experience=text;draft.mobility=null;
    setDirty();renderJobs();$('jobsDetails').open=true;message(`Parsed ${found.length} roles. Verify jobs before saving.`);
  });
  $('addJob').addEventListener('click',()=>{if(!draft)return;draft.roles.push(newRole());draft.mobility=null;
    setDirty();renderJobs();$('jobsDetails').open=true;});
  $('analyzeWorkplaces').addEventListener('click',()=>void analyze());
  $('assessFrance').addEventListener('click',assessWork);
  $('saveReview').addEventListener('click',()=>void save());
  $('applyCapture').addEventListener('click',()=>{
    if(!draft||!draft.captured)return;
    for(const field of FB.FIELDS)if(draft.captured.fields?.[field])draft.fields[field]=draft.captured.fields[field];
    draft.roles=FBCareer.mergeRoles(draft.roles,draft.captured.roles||[]);
    draft.mobility=null;dirty=true;render();message('New capture applied to review fields. Verify and save.');
  });
  for(const name of Object.values(FBCareer.FR_REGIONS)){
    const option=document.createElement('option');option.value=name;option.textContent=name;$('jobRegionFrance').append(option);
  }
  chrome.storage.local.get(SELECT_KEY).then(value=>{
    initialSelection=value[SELECT_KEY]||'';
    if(rows.length&&!dirty&&initialSelection)select(initialSelection,true);
  }).catch(()=>{});
  if(chrome.storage.onChanged?.addListener)chrome.storage.onChanged.addListener((changes,area)=>{
    const next=changes[SELECT_KEY]?.newValue;
    if(area!=='local'||!next)return;
    void root.reload().then(()=>select(next,false)).catch(e=>message(e.message,true));
  });
  root.FBWorkspace={get selectedUrl(){return selectedUrl;},select,reconcile};
})(globalThis);
