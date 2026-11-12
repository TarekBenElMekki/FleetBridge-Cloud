/* Local, conservative calculations from human-reviewed professional experience text. */
(function(root){
  'use strict';
  const months=[
    ['jan','janv','janvier','january'],['fev','fevr','fevrier','feb','february'],
    ['mar','mars','march'],['avr','avril','apr','april'],['mai','may'],
    ['jun','juin','june'],['jul','juil','juillet','july'],
    ['aou','aout','aug','august'],['sep','sept','septembre','september'],
    ['oct','octobre','october'],['nov','novembre','november'],
    ['dec','decembre','december']
  ];
  const monthMap=new Map(months.flatMap((names,index)=>names.map(name=>[name,index])));
  const fold=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[’']/g,"'").toLowerCase().trim();
  const monthIndex=value=>{
    const token=fold(value).replace(/[.,]/g,'').split(/\s+/)[0];
    return monthMap.has(token)?monthMap.get(token):null;
  };
  const point='(?:[A-Za-zÀ-ÿ.]{3,16}\\s+)?(?:19|20)\\d{2}';
  const ongoing="aujourd['’]?hui|pr[eé]sent|actuellement|en poste|present|current|now|to date";
  const dateRange=new RegExp(`(${point})\\s*(?:[-–—]|\\bto\\b|\\bau\\b|\\bà\\b)\\s*(${point}|${ongoing})`,'i');
  const parsedPoint=(value,isEnd,nowSerial)=>{
    if(/^(aujourd|pr[eé]sent|actuellement|en poste|present|current|now|to date)/i.test(fold(value)))
      return {serial:nowSerial,approximate:false};
    const found=String(value).match(/(?:19|20)\d{2}/);
    if(!found)return null;
    const year=Number(found[0]);
    const prefix=String(value).slice(0,found.index).trim();
    const month=monthIndex(prefix);
    return {serial:year*12+(month==null?(isEnd?11:0):month),approximate:month==null};
  };
  const formatMonths=value=>{
    if(!Number.isFinite(value))return '';
    const years=Math.floor(value/12),rest=value%12;
    return [years?`${years} yr${years===1?'':'s'}`:'',rest?`${rest} mo${rest===1?'':'s'}`:''].filter(Boolean).join(' ')||'0 mos';
  };
  const isRole=line=>/(mecanicien|technicien|mechanic|technician|maintenance|ingenieur|engineer|responsable|manager|chauffeur|driver|directeur|director|consultant|electricien|electrician|operateur|operator|stagiaire|intern)/i.test(fold(line));
  const isLocation=line=>/\b(france|tunisie|tunisia|belgique|belgium|canada|germany|allemagne|suisse|switzerland|region|r[eé]gion|paris|lyon|tunis|london|ville|area)\b/i.test(fold(line));
  function companyBefore(lines,index){
    for(let i=index-1;i>=Math.max(0,index-4);i--){
      const line=lines[i].split(/[·•]/)[0].trim();
      if(!line||line.length>130||line.length<2)continue;
      if(/\b(?:19|20)\d{2}\b/.test(line)||isRole(line)||isLocation(line))continue;
      if(/^(experience|exp[eé]rience|temps plein|full.time|cdi|cdd|internship|stage|freelance|ind[eé]pendant|self.employed|formation|education|skills|comp[eé]tences)$/i.test(fold(line)))continue;
      return line;
    }
    return '';
  }
  function summarize(experience,referenceDate=new Date()){
    const lines=String(experience||'').replace(/\r\n?/g,'\n').split('\n').map(s=>s.trim()).filter(Boolean);
    const currentSerial=referenceDate.getFullYear()*12+referenceDate.getMonth();
    const roles=[];
    for(let i=0;i<lines.length;i++){
      const match=lines[i].match(dateRange);
      if(!match)continue;
      const start=parsedPoint(match[1],false,currentSerial);
      const end=parsedPoint(match[2],true,currentSerial);
      if(!start||!end||start.serial>currentSerial)continue;
      const finalEnd=Math.min(end.serial,currentSerial);
      if(finalEnd<start.serial)continue;
      const duration=finalEnd-start.serial+1;
      if(duration>720)continue;
      roles.push({start:start.serial,end:finalEnd,months:duration,company:companyBefore(lines,i),
        dateLine:lines[i],approximate:start.approximate||end.approximate});
    }
    // Merge overlapping and adjacent months: simultaneous jobs must not create
    // fictitious additional years of work experience.
    const merged=[];
    for(const range of [...roles].sort((a,b)=>a.start-b.start||a.end-b.end)){
      const previous=merged[merged.length-1];
      if(previous&&range.start<=previous.end+1)previous.end=Math.max(previous.end,range.end);
      else merged.push({start:range.start,end:range.end});
    }
    const totalMonths=roles.length?merged.reduce((sum,range)=>sum+range.end-range.start+1,0):null;
    const latest=[...roles].sort((a,b)=>b.end-a.end||b.start-a.start)[0];
    const estimated=roles.some(role=>role.approximate);
    return {
      datedRoles:roles.length,
      totalMonths,totalYears:totalMonths==null?null:Number((totalMonths/12).toFixed(1)),
      totalDuration:totalMonths==null?'':formatMonths(totalMonths),
      latestCompany:latest?.company||'',
      latestMonths:latest?.months??null,
      latestYears:latest?Number((latest.months/12).toFixed(1)):null,
      latestDuration:latest?formatMonths(latest.months):'',
      latestDateLine:latest?.dateLine||'',
      estimated,
      note:!roles.length?'No complete date ranges found. Enter role dates to calculate experience.':
        estimated?'Some dates give only years, so durations are approximate. Confirm them against the profile.':
        'Total is the union of dated work periods; overlapping roles count only once.'
    };
  }
  const api={summarize,formatMonths};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBExperienceMetrics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
