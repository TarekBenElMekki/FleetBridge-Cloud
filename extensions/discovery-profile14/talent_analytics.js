/* Small data-first charts. Missing experience/geography is always unknown,
 * never zero. No external charting service or personal-data transmission. */
(function(root){
  'use strict';
  const career=root.FBCareer||(typeof module!=='undefined'&&module.exports?require('./career_intelligence.js'):null);
  const EXPERIENCE=['< 3 years','3–5 years','5–10 years','10+ years','Unknown'];
  const DISTANCE=['0–30 km','31–100 km','101–300 km','301–1,000 km','> 1,000 km','Unknown'];
  const STAGES=['new','reviewing','shortlisted','contacted','interview','rejected'];
  const WORK_TYPES=['permanent','contract','internship','apprenticeship','unspecified'];
  function roles(row){
    const imp=row?.profileImport||{},cap=row?.profileCapture||{};
    return imp.experienceRoles?.length?imp.experienceRoles:cap.roles||[];
  }
  function totalMonths(row){
    const work=roles(row);
    if(!work.length)return null;
    const value=career.summary(work).totalMonths;
    return Number.isFinite(value)?value:null;
  }
  function breakdown(row){return career.experienceBreakdown(roles(row));}
  function roleTypes(row){return [...new Set(roles(row).map(role=>career.roleType(role)))];}
  function distanceKm(row){
    const reviewed=row?.profileImport||{};
    const existing=reviewed.mobility?.maximumWorkplaceSeparationKm;
    if(Number.isFinite(existing)&&existing>=0)return existing;
    const work=roles(row).filter(r=>Number.isFinite(r.geo?.lat)&&Number.isFinite(r.geo?.lon));
    if(work.length<2)return null;
    const assessed=career.assessMobility(work);
    return Number.isFinite(assessed.maximumWorkplaceSeparationKm)?assessed.maximumWorkplaceSeparationKm:null;
  }
  function experienceBucket(months){
    if(!Number.isFinite(months)||months<0)return 'Unknown';
    if(months<36)return '< 3 years';
    if(months<60)return '3–5 years';
    if(months<120)return '5–10 years';
    return '10+ years';
  }
  function distanceBucket(km){
    if(!Number.isFinite(km)||km<0)return 'Unknown';
    if(km<=30)return '0–30 km';
    if(km<=100)return '31–100 km';
    if(km<=300)return '101–300 km';
    if(km<=1000)return '301–1,000 km';
    return '> 1,000 km';
  }
  function distribution(rows=[]){
    const experience=Object.fromEntries(EXPERIENCE.map(k=>[k,0]));
    const distance=Object.fromEntries(DISTANCE.map(k=>[k,0]));
    const stages=Object.fromEntries(STAGES.map(k=>[k,0]));
    const types=Object.fromEntries(WORK_TYPES.map(k=>[k,0]));
    for(const row of rows){
      experience[experienceBucket(totalMonths(row))]++;
      distance[distanceBucket(distanceKm(row))]++;
      const stage=String(row?.status||'new').toLowerCase();
      stages[stage in stages?stage:'new']++;
      for(const role of roles(row))types[career.roleType(role)]++;
    }
    return {total:rows.length,
      experience:{bins:EXPERIENCE.map(k=>({key:k,label:k,value:experience[k]})),known:rows.length-experience.Unknown,unknown:experience.Unknown},
      distance:{bins:DISTANCE.map(k=>({key:k,label:k,value:distance[k]})),known:rows.length-distance.Unknown,unknown:distance.Unknown},
      stages:{bins:STAGES.map(k=>({key:k,label:k==='new'?'New':k.charAt(0).toUpperCase()+k.slice(1),value:stages[k]}))},
      workTypes:{bins:WORK_TYPES.map(k=>({key:k,label:k==='unspecified'?'Unspecified':k.charAt(0).toUpperCase()+k.slice(1),value:types[k]})),
        total:Object.values(types).reduce((a,b)=>a+b,0)}};
  }
  function candidateJobs(work=[]){
    const entries=[];let undated=0;
    for(const role of work){
      const months=career.summary([role]).totalMonths;
      if(!Number.isFinite(months)){undated++;continue;}
      entries.push({key:role.id||`${role.company}:${role.startDate}`,
        label:`${role.company||role.title||'Unspecified job'} (${career.roleType(role)}) · ${role.startDate||'?'}–${role.current?'present':role.endDate||'?'}`,
        value:months});
    }
    entries.sort((a,b)=>b.value-a.value);
    return {bins:entries.slice(0,12),known:entries.length,unknown:undated};
  }
  function candidateHops(work=[],mobility=null){
    // An earlier assessment is ignored when the edited job timeline no longer
    // supports it; callers clear mobility when editing a geographic field.
    const assessment=mobility||career.assessMobility(work);
    const bins=(assessment.transitions||[]).filter(t=>Number.isFinite(t.km)&&t.km>=0)
      .map((t,i)=>({key:`hop-${i}`,label:`${t.from||'?'} → ${t.to||'?'}`,value:t.km}));
    const max=assessment.maximumWorkplaceSeparationKm;
    return {bins:bins.slice(0,12),known:bins.length,
      max: Number.isFinite(max)?max:null};
  }
  function drawBars(host,bins,{selected=null,onSelect=null,formatValue=n=>String(n),emptyText='No verified data yet'}={}){
    if(!host)return;
    host.replaceChildren();const values=(bins||[]).filter(x=>Number.isFinite(x.value)&&x.value>=0);
    if(!values.length||values.every(x=>x.value===0)&&!onSelect){
      const empty=document.createElement('div');empty.className='chart-empty';empty.textContent=emptyText;host.append(empty);return;
    }
    const max=Math.max(1,...values.map(x=>x.value));
    for(const item of values){
      const line=document.createElement(onSelect?'button':'div');
      line.className='analytics-bar-row';if(onSelect)line.type='button';
      if(selected?.has(item.key))line.classList.add('chart-active');
      const label=document.createElement('span');label.className='chart-category';label.textContent=item.label;
      label.title=item.label;
      const track=document.createElement('span');track.className='chart-track';
      const fill=document.createElement('span');fill.className='chart-fill';
      fill.style.width=`${(item.value/max*100).toFixed(1)}%`;track.append(fill);
      const count=document.createElement('strong');count.className='chart-value';count.textContent=formatValue(item.value);
      line.append(label,track,count);
      line.setAttribute('aria-label',`${item.label}: ${formatValue(item.value)}`);
      if(onSelect)line.addEventListener('click',()=>onSelect(item.key));
      host.append(line);
    }
  }
  const api={EXPERIENCE,DISTANCE,STAGES,WORK_TYPES,roles,totalMonths,breakdown,roleTypes,distanceKm,experienceBucket,distanceBucket,
    distribution,candidateJobs,candidateHops,drawBars};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBTalent=api;
})(typeof globalThis!=='undefined'?globalThis:this);
