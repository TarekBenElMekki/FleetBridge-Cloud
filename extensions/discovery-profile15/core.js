/* FleetBridge Discovery: local-only data contracts, validation and export. */
(function (root) {
  'use strict';
  const FIELDS=['name','headline','location','experience'];
  const metrics=root.FBExperienceMetrics||(typeof module!=='undefined'&&module.exports?require('./experience_metrics.js'):null);
  const now=()=>new Date().toISOString();
  function canonicalUrl(input) {
    try {
      const u=new URL(String(input||'').trim());
      if (/(^|\.)google\.com$/i.test(u.hostname)&&u.pathname==='/url')
        return canonicalUrl(u.searchParams.get('q')||u.searchParams.get('url')||'');
      if (!['https:','http:'].includes(u.protocol) || !/(^|\.)linkedin\.com$/i.test(u.hostname)) return '';
      const m=u.pathname.match(/^\/in\/([^/]+)/i);
      return m ? `https://linkedin.com/in/${m[1].toLowerCase()}` : '';
    } catch (_) {return '';}
  }
  function clean(value,max=20000) {
    return String(value??'').replace(/\r\n?/g,'\n').replace(/[\u200b-\u200d\ufeff]/g,'').trim().slice(0,max);
  }
  function redact(value) {
    return String(value||'')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email removed]')
      .replace(/(?<!\w)(?:\+\d{1,3}[\s.()-]?)?(?:\d[\s.()-]?){9,15}(?!\w)/g,'[phone removed]');
  }
  function normalizeProfile(data) {
    const input=data?.fields||data||{};
    const result={};
    for (const key of FIELDS) result[key]=redact(clean(input[key],key==='name'?150:key==='headline'?300:20000));
    return result;
  }
  function score(title,snippet) {
    const value=`${title||''} ${snippet||''}`.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    let score=0;
    for(const [needle,points] of [['mecanicien',30],['mechanic',30],['maintenance',24],['technicien',20],['technician',20],['poids lourds',25],['heavy vehicle',25],['bus',20],['autocar',20],['diesel',16],['atelier',9],['fleet',12]]) if(value.includes(needle)) score+=points;
    if(/\b(chauffeur|driver|conduite)\b/.test(value)&&!/(mecanicien|mechanic|maintenance|technicien)/.test(value))score-=35;
    return Math.max(0,Math.min(100,score));
  }
  function newRecord(url,title='',snippet='',query='') {
    const iso=now();
    return {url:canonicalUrl(url),title:clean(title,300),snippet:clean(snippet,900),sourceQueries:query?[query]:[],
      score:score(title,snippet),signals:[],tier:'Discovery',firstSeen:iso,lastSeen:iso,
      status:'new',notes:'',aiScore:'',aiReason:'',profileImport:null};
  }
  function mergeDiscovery(existing,candidate,query) {
    const url=canonicalUrl(candidate.url);
    if(!url)return null;
    const title=clean(candidate.title||existing?.title||'',300),snippet=clean(candidate.snippet||existing?.snippet||'',900);
    const base=existing||newRecord(url,title,snippet,query);
    return {...base,url,title,snippet,sourceQueries:[...new Set([...(base.sourceQueries||[]),query].filter(Boolean))].slice(-50),
      score:score(title,snippet),lastSeen:now(),profileImport:base.profileImport||null};
  }
  function mergeReview(existing,url,profile,source='manual_visible_page') {
    const key=canonicalUrl(url);
    if(!key)throw new Error('A LinkedIn individual profile URL is required.');
    const base=existing||newRecord(key);
    const fields=normalizeProfile(profile);
    if(!fields.name && !fields.headline)throw new Error('Enter the candidate name or headline before saving.');
    // Retain any legacy fields previously imported, even though the focused
    // v1.1 review UI no longer exposes or exports them.
    return {...base,url:key,profileImport:{...(base.profileImport||{}),...fields,
      experienceSummary:metrics.summarize(fields.experience),sourceMethod:source,importedAt:now()}};
  }
  function pending(rows) {
    return rows.filter(row=>canonicalUrl(row?.url)&&!row?.profileImport?.importedAt&&row.status!=='rejected')
      .sort((a,b)=>Number(b.aiScore||b.score||0)-Number(a.aiScore||a.score||0)||String(a.url).localeCompare(String(b.url)))
      .map(row=>canonicalUrl(row.url));
  }
  function csvCell(value) {
    const s=String(Array.isArray(value)?value.join(' | '):value??'');
    const safe=/^[\s]*[=+\-@\t\r]/.test(s)?`'${s}`:s;
    return `"${safe.replace(/"/g,'""')}"`;
  }
  const COLUMNS=['url','title','snippet','sourceQueries','score','status','notes','firstSeen','lastSeen',
    ...FIELDS.map(x=>'profileImport.'+x),'profileImport.experienceSummary.totalYears',
    'profileImport.experienceSummary.totalDuration','profileImport.experienceSummary.latestCompany',
    'profileImport.experienceSummary.latestYears','profileImport.experienceSummary.latestDuration',
    'profileImport.experienceSummary.estimated','profileImport.importedAt'];
  function toCsv(rows) {
    const body=rows.map(row=>{
      // Calculate on export for old databases that predate experienceSummary.
      const record=row.profileImport?.experience&&!row.profileImport.experienceSummary?
        {...row,profileImport:{...row.profileImport,experienceSummary:metrics.summarize(row.profileImport.experience)}}:row;
      return COLUMNS.map(key=>csvCell(key.split('.').reduce((parent,part)=>parent?.[part],record))).join(',');
    });
    return '\ufeff'+[COLUMNS.map(csvCell).join(','),...body].join('\r\n');
  }
  const api={FIELDS,canonicalUrl,clean,normalizeProfile,newRecord,mergeDiscovery,mergeReview,pending,score,toCsv,
    summarizeExperience:metrics.summarize};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FB=api;
})(typeof globalThis!=='undefined'?globalThis:this);
