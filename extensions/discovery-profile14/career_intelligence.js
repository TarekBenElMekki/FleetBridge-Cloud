/* Human-reviewable employment-history and mobility assessments. No relocation probabilities. */
(function(root){
  'use strict';
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const months={jan:1,janv:1,janvier:1,january:1,fev:2,fevr:2,fevrier:2,feb:2,february:2,mar:3,mars:3,march:3,avr:4,avril:4,apr:4,april:4,mai:5,may:5,jun:6,juin:6,june:6,jul:7,juil:7,juillet:7,july:7,aou:8,aout:8,aug:8,august:8,sep:9,sept:9,septembre:9,september:9,oct:10,octobre:10,october:10,nov:11,novembre:11,november:11,dec:12,decembre:12,december:12};
  const datePoint='(?:[A-Za-zÀ-ÿ.]{3,16}\\s+)?(?:19|20)\\d{2}';
  const dateRange=new RegExp(`(${datePoint})\\s*(?:[-–—]|\\bto\\b|\\bau\\b|\\bà\\b)\\s*(${datePoint}|aujourd['’]?hui|pr[eé]sent|actuellement|present|current|now|to date)`,'i');
  const roleWord=/\b(mecanicien|technicien|maintenance|mechanic|technician|engineer|ingenieur|responsable|chauffeur|driver|electricien|electrician|operateur|operator|manager|chef d|consultant|apprenti|stagiaire|intern|automaticien|automation|automatismes?|electronicien|electronic|electronics|embedded|embarque|developpeur|developer|devops|analyste|analyst|qualite|quality)\b/i;
  const typeHint=/\b(internship|traineeship|intern|stagiaire|stage|apprenticeship|apprenti|alternance|alternant|work.study|permanent|full.time|part.time|cdi|cdd|fixed.term|contract|freelance|self.employed|independant|contrat)\b/i;
  const foldRole=v=>fold(v).replace(/[’‘]/g,"'");
  function employmentType(title='',employerMetadata=''){
    const label=foldRole(title),meta=foldRole(employerMetadata);
    if(/\b(internship|traineeship|intern|stagiaire|stage)\b/.test(meta)||/\b(stagiaire|intern|internship|stage de)\b/.test(label))return 'internship';
    if(/\b(apprenticeship|apprenti|alternance|alternant|work.study)\b/.test(meta)||/\b(apprenti|alternant|apprentice)\b/.test(label))return 'apprenticeship';
    if(/\b(cdd|fixed.term|contract|contrat|freelance|self.employed|independant)\b/.test(meta))return 'contract';
    if(/\b(cdi|permanent|full.time|part.time)\b/.test(meta))return 'permanent';
    return 'unspecified';
  }
  function roleType(role={}){
    return ['unspecified','internship','apprenticeship','contract','permanent'].includes(role.employmentType)?role.employmentType:
      employmentType(role.title,role.employerMetadata||role.company||'');
  }
  function plausibleProfileLocation(value){
    const raw=String(value||'').trim(),s=fold(raw);
    if(raw.length<3||raw.length>145||/\n/.test(raw)||
      /\b(ingenieur|engineer|technicien|technician|mecanicien|mechanic|automaticien|stagiaire|intern|developer|developpeur|diplome|etudiant|student|specialisation|electronique|embedded|informatique|reseaux|maintenance|systemes|systems|chez|university|universite|ecole|school|insa|bts)\b/.test(s))return false;
    return /\b(france|tunisia|tunisie|germany|allemagne|belgium|belgique|switzerland|suisse|canada|maroc|morocco|algeria|algerie|ile.de.france|hauts.de.france|occitanie|normandie|bretagne|auvergne|rhone.alpes|nouvelle.aquitaine|provence|pays de la loire|grand est|centre.val|bourgogne|corse|paris|tunis|sousse|lille|lyon|marseille|bordeaux|nantes|cergy|montreal|montreal|metropolitan|peripherie|environs|region|greater)\b/.test(s)||
      /,\s*[\p{L}][\p{L}\s'-]{2,}/u.test(raw);
  }
  const FR_REGIONS={'01':'Guadeloupe','02':'Martinique','03':'Guyane','04':'La Réunion','06':'Mayotte','11':'Île-de-France','24':'Centre-Val de Loire','27':'Bourgogne-Franche-Comté','28':'Normandie','32':'Hauts-de-France','44':'Grand Est','52':'Pays de la Loire','53':'Bretagne','75':'Nouvelle-Aquitaine','76':'Occitanie','84':'Auvergne-Rhône-Alpes','93':'Provence-Alpes-Côte d’Azur','94':'Corse'};
  const COUNTRY_NAMES={FR:'France',TN:'Tunisia',MA:'Morocco',DZ:'Algeria',BE:'Belgium',CH:'Switzerland',CA:'Canada',SN:'Senegal',CI:'Côte d’Ivoire',CM:'Cameroon',CD:'DR Congo',MG:'Madagascar',DE:'Germany',GB:'United Kingdom'};
  // Selected unambiguous city centers. Never infer foreign coordinates for unknown towns.
  const FOREIGN_CITIES={
    tunis:['TN',36.8065,10.1815],sfax:['TN',34.7406,10.7603],sousse:['TN',35.8256,10.63699],bizerte:['TN',37.2744,9.8739],
    casablanca:['MA',33.5731,-7.5898],rabat:['MA',34.0209,-6.8416],marrakech:['MA',31.6295,-7.9811],tanger:['MA',35.7595,-5.834],fes:['MA',34.0649,-4.995],
    alger:['DZ',36.7538,3.0588],algiers:['DZ',36.7538,3.0588],oran:['DZ',35.6987,-0.6349],constantine:['DZ',36.365,6.6147],
    bruxelles:['BE',50.8503,4.3517],brussels:['BE',50.8503,4.3517],liege:['BE',50.6326,5.5797],namur:['BE',50.4674,4.872],
    geneve:['CH',46.2044,6.1432],lausanne:['CH',46.5197,6.6323],zurich:['CH',47.3769,8.5417],
    montreal:['CA',45.5017,-73.5673],quebec:['CA',46.8139,-71.208],
    dakar:['SN',14.7167,-17.4677],abidjan:['CI',5.36,-4.0083],douala:['CM',4.0511,9.7679],yaounde:['CM',3.848,11.5021],kinshasa:['CD',-4.4419,15.2663],antananarivo:['MG',-18.8792,47.5079],
    berlin:['DE',52.52,13.405],munich:['DE',48.1351,11.582],muenchen:['DE',48.1351,11.582],london:['GB',51.5074,-0.1278]
  };
  function point(text,end=false,reference=new Date()){
    if(/^(present|current|now|aujourd|actuellement|to date)/.test(fold(text)))return {date:`${reference.getFullYear()}-${String(reference.getMonth()+1).padStart(2,'0')}`,current:true,approximate:false};
    const match=String(text||'').match(/(19|20)\d{2}/);if(!match)return null;
    const prefix=fold(text.slice(0,match.index)).replace(/[.,]/g,'').split(/\s+/)[0];
    const month=months[prefix]||(end?12:1);
    return {date:`${match[0]}-${String(month).padStart(2,'0')}`,current:false,approximate:!months[prefix]};
  }
  function dateParts(line,reference){
    const match=String(line||'').match(dateRange);if(!match)return null;
    const start=point(match[1],false,reference),end=point(match[2],true,reference);
    if(!start||!end||start.date>end.date)return null;
    return {startDate:start.date,endDate:end.current?null:end.date,current:end.current,approximate:start.approximate||end.approximate};
  }
  function locationLike(line){
    const s=fold(line);
    return /\b(france|tunisie|tunisia|maroc|morocco|algerie|algeria|belgique|belgium|suisse|switzerland|canada|senegal|cameroun|cameroon|germany|allemagne|ile-de-france|rhone-alpes|occitanie|normandie|bretagne|aquitaine|hauts-de-france|grand est|loire|provence|pays de la loire|centre-val|bourgogne|tunis|sfax|sousse|alger|casablanca|bruxelles|geneve|montreal|dakar|lyon|lille|paris|roubaix|creteil|bordeaux|marseille|nantes|toulouse|strasbourg|nice)\b/.test(s)||
      /,\s*[A-Za-zÀ-ÿ-]{3,}/.test(line);
  }
  function isNoise(line){return /^(experience|exp[eé]riences?|voir plus|see more|show all|voir les|temps plein|full.time|cdi|cdd|sur site|on.site|remote|hybrid)$/i.test(fold(line));}
  function parseExperience(text,reference=new Date()){
    const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n').map(x=>x.trim()).filter(Boolean);
    const roles=[];
    for(let i=0;i<lines.length;i++){
      const dates=dateParts(lines[i],reference);if(!dates)continue;
      const prior=lines.slice(Math.max(0,i-5),i).filter(x=>!isNoise(x)&&!dateParts(x,reference));
      const a=prior.at(-1)||'',b=prior.at(-2)||'';
      let title='',company='';
      // LinkedIn's standard order is title, then employer (+ contract metadata), then dates.
      // Prefer that structure and explicit employment metadata over vocabulary guesses.
      const aRole=roleWord.test(fold(a)),bRole=roleWord.test(fold(b));
      if((aRole&&!bRole)&&!typeHint.test(fold(a))){title=a;company=b;}
      else {title=b;company=a;}
      const after=lines.slice(i+1,Math.min(lines.length,i+5));
      const locationRaw=after.find(x=>!dateParts(x,reference)&&!roleWord.test(fold(x))&&locationLike(x))||'';
      const cleanCompany=company.split(/[·•]/)[0].trim();
      const job={id:`job-${i}`,title:title.slice(0,200),company:cleanCompany.slice(0,200),
        employmentType:employmentType(title,company),employerMetadata:company.includes('·')?company.split('·').slice(1).join('·').trim():'',
        ...dates,locationRaw:locationRaw.slice(0,200),geo:null,locationSource:'reported',source:'parsed_experience_text'};
      if(roles.some(r=>jobSignature(r)===jobSignature(job)))continue;
      roles.push(job);
    }
    return roles;
  }
  function jobSignature(r){return [fold(r.company),fold(r.title),r.startDate||'',r.endDate||'',r.current?'1':'0'].join('|');}
  function mergeRoles(existing,incoming){
    const merged=(Array.isArray(existing)?existing:[]).map(r=>({...r}));
    for(const item of incoming||[]){const prior=merged.find(x=>jobSignature(x)===jobSignature(item));
      if(prior){if(!prior.locationRaw&&item.locationRaw)prior.locationRaw=item.locationRaw;continue;}
      merged.push({...item,id:item.id&&!(merged.some(x=>x.id===item.id))?item.id:`job-${Date.now()}-${merged.length}`});
    }
    return merged;
  }
  function summary(roles,reference=new Date()){
    const current=`${reference.getFullYear()}-${String(reference.getMonth()+1).padStart(2,'0')}`;
    const intervals=(roles||[]).filter(r=>r.startDate&&(r.current||r.endDate)).map(r=>({
      role:r,start:Number(r.startDate.slice(0,4))*12+Number(r.startDate.slice(5))-1,
      end:Number((r.current?current:r.endDate).slice(0,4))*12+Number((r.current?current:r.endDate).slice(5))-1
    })).filter(r=>r.start<=r.end).sort((a,b)=>a.start-b.start);
    const merged=[];for(const span of intervals){const p=merged.at(-1);if(p&&span.start<=p.end+1)p.end=Math.max(p.end,span.end);else merged.push({start:span.start,end:span.end});}
    const total=intervals.length?merged.reduce((a,b)=>a+b.end-b.start+1,0):null;
    const latest=[...intervals].sort((a,b)=>b.end-a.end||b.start-a.start)[0];
    const format=n=>n==null?'':`${Math.floor(n/12)} yrs ${n%12} mos`;
    return {datedRoles:intervals.length,totalMonths:total,totalYears:total==null?null:Number((total/12).toFixed(1)),totalDuration:format(total),
      latestCompany:latest?.role.company||'',latestMonths:latest?latest.end-latest.start+1:null,
      latestYears:latest?Number(((latest.end-latest.start+1)/12).toFixed(1)):null,
      latestDuration:latest?format(latest.end-latest.start+1):'',latestDateLine:'',
      estimated:(roles||[]).some(r=>r.approximate),note:'Calculated from edited job records, merging overlapping months.'};
  }
  function experienceBreakdown(roles=[],reference=new Date()){
    const groups={internship:[],apprenticeship:[],other:[]};
    for(const role of roles){const kind=roleType(role);groups[kind==='internship'?'internship':kind==='apprenticeship'?'apprenticeship':'other'].push(role);}
    const duration=items=>summary(items,reference).totalMonths;
    return {totalMonths:duration(roles),nonInternshipMonths:duration(groups.other),
      internshipMonths:duration(groups.internship),apprenticeshipMonths:duration(groups.apprenticeship),
      nonInternshipJobs:groups.other.length,internshipJobs:groups.internship.length,apprenticeshipJobs:groups.apprenticeship.length,
      note:'Individual categories use overlap-aware durations. Concurrent categories can overlap.'};
  }
  function countryHint(raw){
    const s=fold(raw);
    const choices=[['FR',/\bfrance\b/],['TN',/\b(tunisie|tunisia)\b/],['MA',/\b(maroc|morocco)\b/],['DZ',/\b(algerie|algeria)\b/],['BE',/\b(belgique|belgium)\b/],['CH',/\b(suisse|switzerland)\b/],['CA',/\bcanada\b/],['SN',/\b(senegal|sénégal)\b/],['CI',/\b(cote d.ivoire|ivory coast)\b/],['CM',/\b(cameroun|cameroon)\b/],['CD',/\b(congo|rdc|drc)\b/],['MG',/\bmadagascar\b/],['DE',/\b(germany|allemagne|deutschland)\b/],['GB',/\b(england|united kingdom|royaume.uni)\b/]];
    const found=choices.find(([,re])=>re.test(s));if(found)return found[0];
    if(Object.values(FR_REGIONS).some(n=>s.includes(fold(n))))return 'FR';
    return '';
  }
  function firstCity(raw){return fold(String(raw||'').split(/[,·•|]/)[0]).replace(/\s+(et peripherie|et environs|and surrounding area)$/,'').trim();}
  function offlineGeocode(raw){
    const city=firstCity(raw),hint=countryHint(raw),entry=FOREIGN_CITIES[city];
    if(entry&&(!hint||hint===entry[0]))return {city,region:'',regionCode:'',departmentCode:'',countryCode:entry[0],lat:entry[1],lon:entry[2],precision:'city-center',source:'bundled-city-reference'};
    return null;
  }
  function km(a,b){
    if(!a||!b||![a.lat,a.lon,b.lat,b.lon].every(Number.isFinite))return null;
    const rad=x=>x*Math.PI/180,lat=rad(b.lat-a.lat),lon=rad(b.lon-a.lon);
    const h=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lon/2)**2;
    return Math.round(6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));
  }
  function assessMobility(roles,targetGeo=null,interest='unknown',currentResidenceGeo=null){
    const dated=(roles||[]).filter(x=>x.startDate).sort((a,b)=>a.startDate.localeCompare(b.startDate));
    const located=dated.filter(r=>r.geo?.countryCode);
    const countries=[...new Set(located.map(r=>r.geo.countryCode))],frRegions=[...new Set(located.filter(r=>r.geo.countryCode==='FR'&&r.geo.regionCode).map(r=>r.geo.regionCode))];
    let maxKm=null,transitions=[],maxSeparationKm=null;
    for(let i=0;i<located.length;i++)for(let j=i+1;j<located.length;j++){
      const distance=km(located[i].geo,located[j].geo);
      if(distance!=null)maxSeparationKm=Math.max(maxSeparationKm??0,distance);
    }
    for(let i=1;i<located.length;i++){
      const before=located[i-1],after=located[i];
      // Concurrent jobs do not establish travel or relocation in either direction.
      if(before.current||(before.endDate&&before.endDate>after.startDate))continue;
      const distance=km(before.geo,after.geo);if(distance!=null){maxKm=Math.max(maxKm??0,distance);transitions.push({from:before.geo.city,to:after.geo.city,km:distance});}
    }
    const allCountries=located.map(r=>r.geo.countryCode),returns=allCountries.some((c,i)=>i>=2&&allCountries.slice(0,i-1).includes(c)&&allCountries[i-1]!==c);
    const countrySequence=allCountries.filter((country,index)=>index===0||country!==allCountries[index-1]).map(x=>COUNTRY_NAMES[x]||x);
    const cities=[...new Set(located.map(r=>`${fold(r.geo.city)}|${r.geo.countryCode}`))];
    let label='Insufficient geographic evidence';
    if(countries.length>=2)label=returns?'International return pattern':'International workplace history';
    else if(frRegions.length>=2)label='Interregional work history in France';
    else if(located.length>=2&&cities.length===1)label='Same workplace city throughout recorded history';
    else if(located.length>=2&&maxSeparationKm!=null&&maxSeparationKm<=30)label='Nearby workplace cities (within 30 km)';
    else if(frRegions.length===1&&located.length>=2)label='Same French region, multiple workplaces';
    else if(located.length>=2&&maxSeparationKm!=null)label='Multiple workplace locations';
    const last=[...dated].reverse().find(r=>r.geo);
    const destinationKm=km(currentResidenceGeo||last?.geo,targetGeo);
    const details=[`${located.length}/${dated.length} dated roles have a resolved location.`,
      countries.length?`${countries.length} country/countries represented. Reported job-country sequence: ${countrySequence.join(' → ')}.`:'Country history unknown.',
      frRegions.length?`${frRegions.length} French region(s) represented.`:'No confirmed French regional coverage.',
      maxSeparationKm!=null?`Greatest separation between any recorded workplaces: ${maxSeparationKm} km (straight line).`:'Workplace distances unavailable.',
      maxKm!=null?`Largest non-overlapping successive job-location change: ${maxKm} km.`:'No successive non-overlapping job-location distance established.',
      returns?'The employment-country sequence includes a return to a previous country.':'No international return pattern established.',
      destinationKm!=null?`${currentResidenceGeo?'Confirmed current residence':'Last known workplace (residence unverified)'} to selected destination: ${destinationKm} km (straight line).`:'Select and resolve a destination to compare distances.',
      interest==='yes'?'Candidate explicitly confirmed willingness to relocate.':interest==='no'?'Candidate explicitly reported no willingness to relocate.':'Willingness to relocate has not been confirmed.',
      'Employment locations do not prove residence moves or predict a future move.'
    ];
    return {label,distinctCountries:countries.length,distinctFrenchRegions:frRegions.length,maximumWorkplaceDistanceKm:maxKm,
      maximumWorkplaceSeparationKm:maxSeparationKm,distinctCities:cities.length,countrySequence,
      destinationDistanceKm:destinationKm,internationalReturn:returns,transitions,relocationWillingness:interest,
      coverage:`${located.length}/${dated.length}`,evidenceQuality:located.length===dated.length&&located.length>=2?'strong workplace-history coverage':located.length>=2?'partial':'insufficient',explanation:details.join(' ')};
  }
  function assessFranceWork(input={}){
    const missing=[];if(!input.citizenshipGroup||input.citizenshipGroup==='unknown')missing.push('Verified citizenship/work-rights category');
    if(!input.workRights||input.workRights==='unknown')missing.push('Existing authorization to work in France');
    if(!input.jobTitle)missing.push('Actual proposed job');
    if(!input.jobRegion)missing.push('French job region');
    if(!input.contractType)missing.push('Proposed contract type');
    let status='Information required',next='Confirm the information with the candidate and hiring employer.';
    if(input.citizenshipGroup==='eu_eea_swiss'&&input.workRights==='verified_no'){
      status='Conflicting work-rights answers';next='Verify citizenship, residence status and right-to-work documents before using this checklist.';
    }else if(input.workRights==='verified_yes'||input.citizenshipGroup==='eu_eea_swiss'){
      status='Existing work-rights route';next='Verify identity and work-rights evidence for the specific position; check occupational qualifications separately.';
    }else if(input.citizenshipGroup==='non_eu'&&input.workRights==='verified_no'){
      if(input.employerApplies==='yes'&&(input.shortageRoute==='yes'||input.publicationRoute==='yes')&&input.jobTitle&&input.jobRegion&&input.contractType){
        status='Potential employer authorization route';next='Employer must apply; administrative approval and any later visa are not guaranteed.';
      }else if(input.employerApplies==='no'){
        status='Employer action not available';next='The standard employer-led route cannot proceed unless an eligible employer undertakes the procedure.';
      }else{
        status='Employer authorization assessment pending';next='Check applicable shortage occupation and region or recruitment-advertisement route, plus employer eligibility.';
      }
      if(input.residence==='abroad')next+=' If granted, the authorization normally precedes an applicable long-stay visa application.';
    }
    if(input.driverQualification==='needs_check')next+=' Check professional heavy-vehicle driving authorization separately.';
    return {status,next,missingInformation:missing,assessedAt:new Date().toISOString(),
      disclaimer:'Administrative screening only. It does not predict a visa decision; review current official rules and individual circumstances.'};
  }
  const api={FR_REGIONS,COUNTRY_NAMES,parseExperience,mergeRoles,summary,employmentType,roleType,experienceBreakdown,plausibleProfileLocation,
    offlineGeocode,countryHint,firstCity,km,assessMobility,assessFranceWork};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBCareer=api;
})(typeof globalThis!=='undefined'?globalThis:this);
