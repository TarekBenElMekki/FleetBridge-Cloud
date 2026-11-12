/* RATP-group legal establishments from France's public business registry.
 * The API search may not expose every operating site: never imply completeness. */
(function(root){
  'use strict';
  const KEY='fleetbridgeRatpLocationsV1';
  const SEED=[{id:'siret:77566343801906',siret:'77566343801906',company:'RATP',
    name:'RATP — registered head office',category:'Office / headquarters',
    address:'54 quai de la Rapée, 75012 Paris, France',lat:48.842687714,lon:2.3720426172,
    source:'French public business register (SIRET 77566343801906)',verified:true}];
  const COMPANY_NAMES=['RATP','RATP DEV','RATP CAP ÎLE-DE-FRANCE','RATP CONNECT','RATP REAL ESTATE',
    'RATP MAINTENANCE SERVICES','RATP SMART SYSTEMS','RATP INFRASTRUCTURES','RATP HABITAT',
    'RATP TRAVEL RETAIL','RATP EXPERTISES'];
  function companyName(value){
    const original=String(value||'').trim(),upper=original.toLocaleUpperCase('fr');
    if(!/^RATP(?:\b|\s|-)/.test(upper))return null;
    return COMPANY_NAMES.find(c=>upper===c.toLocaleUpperCase('fr'))||original;
  }
  function classify(text){
    const s=String(text||'').toLowerCase();
    if(/(atelier|maintenance|technicentre|technicien|réparation|reparation)/.test(s))return 'Maintenance / workshop';
    if(/(centre bus|centre-bus|d[eé]p[oô]t|remisage|garage)/.test(s))return 'Bus depot / operations';
    if(/(tramway|rer|m[eé]tro|ferroviaire|rail)/.test(s))return 'Rail / tram';
    if(/(si[eè]ge|administration|bureau|direction|head office)/.test(s))return 'Office / headquarters';
    return 'Other establishment';
  }
  function normalize(raw,legalName='RATP'){
    const company=companyName(legalName);if(!company)return null;
    const siret=String(raw.siret||'').replace(/\s+/g,'');
    const rawLat=raw.latitude??raw.lat,rawLon=raw.longitude??raw.lon;
    if(rawLat==null||rawLon==null||rawLat===''||rawLon==='')return null;
    const lat=Number(rawLat),lon=Number(rawLon);
    const status=raw.etat_administratif_etablissement??raw.etat_administratif;
    if(status&&status!=='A')return null;
    if(!/^\d{14}$/.test(siret)||!Number.isFinite(lat)||!Number.isFinite(lon)||
      Math.abs(lat)>90||Math.abs(lon)>180)return null;
    const address=String(raw.adresse||raw.adresse_complete||'').trim();
    const name=String(raw.nom_commercial||raw.enseigne||raw.enseigne_1||raw.liste_enseignes?.[0]||
      raw.libelle_enseigne||raw.nom_enseigne||raw.complement_adresse||'').trim();
    return {id:`siret:${siret}`,siret,company,name:name||`${company} — establishment`,
      category:classify(`${name} ${address}`),address,lat,lon,
      source:'French public business registry',verified:true};
  }
  function unique(sites){const byId=new Map();for(const site of [...SEED,...(sites||[])]){
    if(site&&Number.isFinite(Number(site.lat))&&Number.isFinite(Number(site.lon)))byId.set(site.id,site);
  }return [...byId.values()];}
  async function retrieve(fetcher=fetch,onProgress=()=>{}){
    const sites=[];let scanned=0,requests=0,partial=false;
    // Pages contain legal entities; matching establishments are independently paged.
    // The public endpoint is a *search*, not a guaranteed full establishment export.
    for(let page=1;page<=5;page++){
      const url=new URL('https://recherche-entreprises.api.gouv.fr/search');
      url.searchParams.set('q','RATP');url.searchParams.set('etat_administratif','A');
      url.searchParams.set('per_page','25');url.searchParams.set('page',String(page));
      url.searchParams.set('limite_matching_etablissements','100');
      const response=await fetcher(String(url),{headers:{Accept:'application/json'}});
      requests++;if(!response.ok)throw new Error(`French registry returned HTTP ${response.status}`);
      const data=await response.json();const results=Array.isArray(data.results)?data.results:[];
      for(const legal of results){
        scanned++;const company=String(legal.siren)==='775663438'?'RATP':
          companyName(legal.nom_complet||legal.nom_raison_sociale||legal.sigle||legal.nom_raison_sociale_etablissement||'');
        if(!company)continue;
        const head=normalize(legal.siege||{},company);if(head)sites.push(head);
        for(const raw of legal.matching_etablissements||[]){const site=normalize(raw,company);if(site)sites.push(site);}
        const count=Number(legal.nombre_etablissements_ouverts)||0;
        const matched=legal.matching_etablissements?.length||0;
        if(count>matched+Number(Boolean(head)))partial=true;
        // Paging here only returns the establishments matching the search query.
        // Never extrapolate missing depots as locations.
        onProgress(`${sites.length} mapped · ${scanned} entities examined`);
      }
      const total=Number(data.total_results??data.total??0);
      if(results.length<25||total&&page*25>=total)break;
      if(page===5)partial=true;
    }
    return {sites:unique(sites),partial,scanned,requests,syncedAt:new Date().toISOString(),
      source:'https://recherche-entreprises.api.gouv.fr/docs/'};
  }
  async function read(storage){
    try{const value=(await storage.get(KEY))[KEY];return value&&Array.isArray(value.sites)?
      {...value,sites:unique(value.sites)}:{sites:SEED,partial:true,syncedAt:null};}
    catch(_){return {sites:SEED,partial:true,syncedAt:null};}
  }
  async function sync(storage,fetcher=fetch,onProgress=()=>{}){
    const result=await retrieve(fetcher,onProgress);
    // A transiently empty API response must not erase successfully cached sites.
    const previous=await read(storage);result.sites=unique([...previous.sites,...result.sites]);
    await storage.set({[KEY]:result});return result;
  }
  const api={KEY,SEED,COMPANY_NAMES,companyName,classify,normalize,unique,retrieve,read,sync};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBRatp=api;
})(typeof globalThis!=='undefined'?globalThis:this);
