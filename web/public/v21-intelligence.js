/* Evidence-first candidate signals. Unknown fields are never silently estimated. */
(function(root){
  'use strict';
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const valid=n=>typeof n==='number'&&Number.isFinite(n);
  function age(row){
    for(const n of [row?.age,row?.profileImport?.age,row?.profileCapture?.fields?.age]){
      if((typeof n==='number'||typeof n==='string'&&/^\d{1,2}$/.test(n)) && Number(n)>=16 && Number(n)<=90)return Number(n);
    }
    const birth=row?.profileImport?.dateOfBirth||row?.birthDate;
    if(/^\d{4}-\d{2}-\d{2}$/.test(birth||'')){
      const d=new Date(birth+'T00:00:00Z'),now=new Date();if(Number.isNaN(d.getTime())||d>now)return null;
      const years=now.getUTCFullYear()-d.getUTCFullYear()-(now.getUTCMonth()<d.getUTCMonth()||now.getUTCMonth()===d.getUTCMonth()&&now.getUTCDate()<d.getUTCDate()?1:0);
      return years>=16&&years<=90?years:null;
    }
    return null;
  }
  function serial(value,nowSerial){
    if(!value)return null;
    if(/^(present|current|now|ongoing|aujourd'hui|en cours)$/i.test(String(value).trim()))return nowSerial;
    const match=String(value).match(/^((?:19|20)\d{2})(?:-(1[0-2]|0?[1-9]))?(?!\d)/);
    return match?Number(match[1])*12+(match[2]?Number(match[2])-1:0):null;
  }
  function experience(row){
    for(const n of [row?.profileImport?.experienceMetrics?.totalYears,row?.experienceMetrics?.totalYears,row?.profileImport?.experienceSummary?.totalYears,row?.profileImport?.totalYears])if((typeof n==='number'||typeof n==='string'&&n.trim()!==''&&!Number.isNaN(Number(n)))&&Number(n)>=0&&Number(n)<70)return Number(n);
    const roles=[...(row?.profileImport?.experienceRoles||[]),...(row?.profileCapture?.roles||[])];
    const now=new Date(),today=now.getFullYear()*12+now.getMonth(),ranges=[];
    for(const r of roles){
      const start=serial(r.startDate||r.start,today),end=serial(r.endDate||r.end||'present',today);
      if(start!==null&&end!==null&&start<=end&&start<=today&&end-start<600)ranges.push([start,Math.min(today,end)]);
    }
    if(!ranges.length)return null;
    ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
    for(const [start,end] of ranges){const last=merged[merged.length-1];if(last&&start<=last[1]+1)last[1]=Math.max(end,last[1]);else merged.push([start,end]);}
    return Math.round(merged.reduce((sum,[a,b])=>sum+(b-a+1),0)/12*10)/10;
  }
  function cityIndex(data){
    const byName=new Map();for(const row of data?.cities||[]){const key=fold(row[0]);const list=byName.get(key)||[];list.push(row);byName.set(key,list);}return byName;
  }
  function geolocate(raw,index){
    const city=String(raw||'').split(/[,|·]/)[0].trim();if(!city||city.length>80)return null;
    const matches=index.get(fold(city))||[];
    if(matches.length!==1)return null;
    const [name,lat,lng,department]=matches[0];return {city:name,lat,lng,department,precision:'Approximate commune centre'};
  }
  function workLocations(row,index){
    const roles=[...(row?.profileImport?.experienceRoles||[]),...(row?.profileCapture?.roles||[])],seen=new Set(),points=[];
    for(const role of roles){
      if(!role||typeof role!=='object')continue;
      const city=role.location||role.city||role.geo?.city||role.workLocation||'';
      const explicit=role.geo&&Number.isFinite(Number(role.geo.lat))&&Number.isFinite(Number(role.geo.lon))?{city:role.geo.city||city||'Recorded location',lat:Number(role.geo.lat),lng:Number(role.geo.lon),precision:'Coordinates recorded with role'}:null;
      const coord=explicit||geolocate(city,index);
      if(!coord)continue;
      const key=String(role.company||role.employer||'')+':'+coord.lat+':'+coord.lng+':'+String(role.startDate||'');
      if(seen.has(key))continue;seen.add(key);
      points.push({...coord,company:role.company||role.employer||'Employer not specified',role:role.title||role.position||'',startDate:role.startDate||'',endDate:role.endDate||'',source:'Recorded experience role'});
    }
    return points.sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
  }
  function km(a,b){
    const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlng=(b.lng-a.lng)*rad;
    return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlng/2)**2));
  }
  function closestTransit(point,companies){
    if(!point)return null;
    const candidates=companies.filter(x=>x.sector==='public'&&x.code==='FR'&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng)));
    const ranked=candidates.map(x=>({...x,distanceKm:km(point,{lat:Number(x.lat),lng:Number(x.lng)})})).sort((a,b)=>a.distanceKm-b.distanceKm);
    return ranked[0]||null;
  }
  root.FBV21={age,experience,cityIndex,geolocate,workLocations,closestTransit,km};
})(typeof globalThis==='object'?globalThis:this);
