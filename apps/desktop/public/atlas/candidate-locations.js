/* Candidate city positions derived from local FleetBridge records.
   Never sends profile names or URLs to a geocoder, and never infers homes. */
(function(root){
  'use strict';
  const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘]/g,"'").trim();
  const cityKey=s=>fold(s).replace(/\bst[.]?(?=[\s-])/g,'saint').replace(/[^a-z0-9]/g,'');
  const FR_REGIONS={'11':'Île-de-France','24':'Centre-Val de Loire','27':'Bourgogne-Franche-Comté','28':'Normandie','32':'Hauts-de-France','44':'Grand Est','52':'Pays de la Loire','53':'Bretagne','75':'Nouvelle-Aquitaine','76':'Occitanie','84':'Auvergne-Rhône-Alpes','93':'Provence-Alpes-Côte d’Azur','94':'Corse'};
  const knownCountries=[['FR',/\b(france|francais|french)\b/],['DE',/\b(germany|deutschland|allemagne)\b/],['BE',/\b(belgium|belgique)\b/],['CH',/\b(switzerland|suisse|schweiz)\b/],['GB',/\b(united kingdom|england|royaume-uni)\b/],['ES',/\b(spain|espagne|espana)\b/],['IT',/\b(italy|italie|italia)\b/],['NL',/\b(netherlands|pays-bas|nederland)\b/],['PT',/\b(portugal)\b/],['AT',/\b(austria|autriche)\b/]];
  function cityFromLocation(raw){
    const s=String(raw||'').split(/[,·•|]/)[0].trim().replace(/^(?:Greater\s+)(.+?)(?:\s+Metropolitan(?:\s+Region|\s+Area))?$/i,'$1');
    return s.replace(/\s+(?:et périphérie|et peripherie|et environs|and surrounding area|metropolitan area)$/i,'').trim();
  }
  // Some Google discovery links expose an explicitly labeled location before
  // a candidate profile is captured. Accept only the initial location segment
  // with an explicit country; never interpret arbitrary role text as a city.
  function discoveryLocation(snippet){
    const segment=String(snippet||'').split(/[·•|\n]/)[0].trim();
    if(segment.length>150||segment.length<6)return '';
    const parts=segment.split(',').map(x=>x.trim()).filter(Boolean);
    if(parts.length<2||parts.length>3||!parts[0]||parts[0].length>65)return '';
    const country=parts[parts.length-1];
    return /^(france|germany|deutschland|belgium|belgique|switzerland|suisse|united kingdom|england|spain|espagne|italy|italie|netherlands|pays-bas|portugal|austria|autriche)$/i.test(country)?segment:'';
  }
  function countryHint(raw){const s=fold(raw);
    const match=knownCountries.find(([,re])=>re.test(s));if(match)return match[0];
    if(Object.values(FR_REGIONS).some(name=>s.includes(fold(name))))return 'FR';
    return '';
  }
  const geoValid=geo=>geo&&geo.lat!==''&&geo.lon!==''&&geo.lat!=null&&geo.lon!=null&&
    Number.isFinite(Number(geo.lat))&&Number.isFinite(Number(geo.lon))&&
    Math.abs(Number(geo.lat))<=90&&Math.abs(Number(geo.lon))<=180;
  function findCity(raw,operators){const key=cityKey(cityFromLocation(raw)),hint=countryHint(raw);
    if(!key)return null;
    const hits=operators.filter(o=>cityKey(o.city)===key&&(!hint||o.code===hint));
    if(!hits.length||new Set(hits.map(o=>o.code)).size!==1)return null;
    const o=hits[0];return {city:o.city,code:o.code,country:o.country,lat:Number(o.lat),lng:Number(o.lng),precision:'approximate city centre from Atlas reference'};
  }
  async function frenchCity(raw,fetcher){
    if(countryHint(raw)!=='FR')return null;
    const city=cityFromLocation(raw);if(city.length<2||city.length>90||/^france$/i.test(city))return null;
    const query=`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=nom,codeRegion,centre&format=json&geometry=centre`;
    try{
      const response=await fetcher(query,{headers:{Accept:'application/json'}});if(!response.ok)return null;
      const data=await response.json();if(!Array.isArray(data))return null;
      const hits=data.filter(x=>fold(x.nom)===fold(city)&&Array.isArray(x.centre?.coordinates));
      const region=Object.entries(FR_REGIONS).find(([,name])=>fold(raw).includes(fold(name)))?.[0];
      const exact=region?hits.filter(x=>x.codeRegion===region):hits;
      if(exact.length!==1)return null;
      return {city:exact[0].nom,code:'FR',country:'France',lat:Number(exact[0].centre.coordinates[1]),lng:Number(exact[0].centre.coordinates[0]),precision:'approximate commune centre from French government API'};
    }catch{return null;}
  }
  function chosenGeo(row){
    for(const x of [row.profileImport?.geo,row.profileCapture?.geo])if(geoValid(x))return {lat:Number(x.lat),lng:Number(x.lon),precision:'recorded profile geographic coordinates'};
    const roles=[...(row.profileImport?.experienceRoles||[]),...(row.profileCapture?.roles||[])].filter(r=>geoValid(r.geo));
    roles.sort((a,b)=>String(b.endDate||b.startDate||'').localeCompare(String(a.endDate||a.startDate||'')));
    const role=roles[0];return role?{lat:Number(role.geo.lat),lng:Number(role.geo.lon),city:role.geo.city||'',code:role.geo.countryCode||'',precision:'recorded workplace evidence, not a home address'}:null;
  }
  const geoCache=new Map();
  async function build(rows,operators,{fetcher=typeof fetch==='function'?fetch:null}={}){
    if(!Array.isArray(rows))return {mapped:[],unmapped:0};
    const mapped=[],cache=fetcher===globalThis.fetch?geoCache:new Map();let unmapped=0,next=0;
    const work=async()=>{while(next<rows.length){
      const row=rows[next++];
      if(typeof row?.url!=='string'||!/^https?:\/\/(?:www\.)?linkedin\.com\/in\//i.test(row.url)){unmapped++;continue;}
      const raw=row.profileImport?.location||row.profileCapture?.fields?.location||discoveryLocation(row.snippet)||'';
      // User-reported profile location is preferred over historical workplaces.
      const key=fold(raw);let at=findCity(raw,operators);
      if(!at&&fetcher&&countryHint(raw)==='FR'){
        if(!cache.has(key))cache.set(key,frenchCity(raw,fetcher));at=await cache.get(key);
      }
      if(!at)at=chosenGeo(row);
      if(!at||!Number.isFinite(at.lat)||!Number.isFinite(at.lng)){unmapped++;continue;}
      const name=row.profileImport?.name||row.profileCapture?.fields?.name||String(row.title||'').split(/[|–-]/)[0].trim()||'Candidate';
      mapped.push({id:`desktop-candidate:${row.url.toLowerCase()}`,type:'candidate',origin:'desktop',name,city:at.city||cityFromLocation(raw)||'Recorded workplace',country:at.country||'',code:at.code||'',lat:at.lat,lng:at.lng,
        precision:at.precision,headline:row.profileImport?.headline||row.profileCapture?.fields?.headline||'',source:row.url,status:row.status||'new',locationEvidence:raw||'Workplace-only evidence',mode:'candidate'});
    }};
    await Promise.all(Array.from({length:Math.min(5,rows.length)},work));
    return {mapped,unmapped};
  }
  const api={build,cityFromLocation,discoveryLocation,countryHint,findCity,frenchCity,chosenGeo};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBAtlasCandidates=api;
})(globalThis);
