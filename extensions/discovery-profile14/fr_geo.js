/* On-demand locality lookups. Only city names are sent, never profile details. */
(function(root){
  'use strict';
  const career=root.FBCareer||(typeof module!=='undefined'&&module.exports?require('./career_intelligence.js'):null);
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const cache=new Map();
  function countryGuess(value){return career.countryHint(value);}
  async function resolveLocation(raw,fetcher=fetch){
    const input=String(raw||'').trim();if(!input)return {geo:null,reason:'No work location entered'};
    const bundled=career.offlineGeocode(input);
    if(bundled)return {geo:bundled,reason:'Bundled city reference'};
    const country=countryGuess(input);
    if(country&&country!=='FR')return {geo:null,reason:'Non-French town needs a manually verified country and coordinates'};
    const city=input.split(/[,·•|]/)[0].replace(/\s+(et périphérie|et peripherie|et environs|and surrounding area)$/i,'').trim();
    if(!city||city.length>90)return {geo:null,reason:'Enter a city (e.g., Lille, France)'};
    if(!country)return {geo:null,reason:'Specify France, a French region, or another country to disambiguate'};
    const cacheKey=clean(input);if(cache.has(cacheKey))return cache.get(cacheKey);
    const url=`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(city)}&fields=nom,code,codeDepartement,codeRegion,centre&format=json&geometry=centre`;
    try{
      const response=await fetcher(url,{method:'GET',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const matches=(await response.json()).filter(x=>clean(x.nom)===clean(city)&&Array.isArray(x.centre?.coordinates));
      const regionHint=Object.entries(career.FR_REGIONS).find(([,name])=>clean(input).includes(clean(name)))?.[0];
      const exact=regionHint?matches.filter(x=>x.codeRegion===regionHint):matches;
      if(exact.length!==1)return {geo:null,reason:exact.length?'Ambiguous town: add the French region or edit the location':'No exact French commune match'};
      const match=exact[0];
      const geo={city:match.nom,region:career.FR_REGIONS[match.codeRegion]||'',regionCode:match.codeRegion,departmentCode:match.codeDepartement,
        countryCode:'FR',lat:match.centre.coordinates[1],lon:match.centre.coordinates[0],precision:'commune-center',source:'geo.api.gouv.fr'};
      const result={geo,reason:'Official French commune/region reference'};cache.set(cacheKey,result);return result;
    }catch(error){return {geo:null,reason:`French location lookup unavailable: ${error.message}`};}
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={resolveLocation};
  root.FBGeo={resolveLocation};
})(typeof globalThis!=='undefined'?globalThis:this);
