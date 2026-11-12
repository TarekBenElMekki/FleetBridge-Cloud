'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
function canonicalUrl(input){
  try{const u=new URL(String(input||''));if(!/^https?:$/.test(u.protocol)||!/(^|\.)linkedin\.com$/i.test(u.hostname))return '';
    const match=u.pathname.match(/^\/in\/([^/]+)/i);return match?`https://linkedin.com/in/${match[1].toLowerCase()}`:'';
  }catch{return '';}
}
function createStore(directory=process.env.FLEETBRIDGE_DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'FleetBridgeDesktop','Data')){
  fs.mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(path.join(directory,'fleetbridge.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`CREATE TABLE IF NOT EXISTS candidates(url TEXT PRIMARY KEY,payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS establishments(id TEXT PRIMARY KEY,payload TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS client_tokens(hash TEXT PRIMARY KEY,label TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS atlas_prospects(id TEXT PRIMARY KEY,status TEXT NOT NULL,notes TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS atlas_custom(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contracts(id TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const get=db.prepare('SELECT payload FROM candidates WHERE url=?');
  const put=db.prepare('INSERT INTO candidates(url,payload,updated_at) VALUES(?,?,?) ON CONFLICT(url) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
  const establishmentGet=db.prepare('SELECT payload FROM establishments WHERE id=?');
  const establishmentPut=db.prepare('INSERT INTO establishments(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
  const stable=(value)=>value&&typeof value==='object'&&!Array.isArray(value);
  const isReviewed=row=>Boolean(row?.profileImport?.importedAt);
  function merge(current,incoming){
    if(!current)return incoming;
    // Chrome is an intake client. CRM decisions in the desktop database win.
    const sourceQueries=[...new Set([...(current.sourceQueries||[]),...(incoming.sourceQueries||[])])].slice(-50);
    const result={...current,...incoming,sourceQueries};
    // Chrome review edits are accepted until the recruiter edits the desktop record.
    if(current._desktopReviewUpdatedAt){for(const key of ['status','notes','aiScore','aiReason'])if(current[key]!==undefined)result[key]=current[key];
      result._desktopReviewUpdatedAt=current._desktopReviewUpdatedAt;}
    if(isReviewed(current)&&(!isReviewed(incoming)||String(current.profileImport.importedAt)>=String(incoming.profileImport.importedAt)))result.profileImport=current.profileImport;
    if(current.profileCapture&&(!incoming.profileCapture||String(current.profileCapture.capturedAt||'')>String(incoming.profileCapture.capturedAt||'')))result.profileCapture=current.profileCapture;
    result.firstSeen=current.firstSeen||incoming.firstSeen;
    return result;
  }
  function upsertCandidates(rows){if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid candidate batch.');
    let added=0,updated=0,skipped=0;db.exec('BEGIN IMMEDIATE');
    try{for(const item of rows){const url=canonicalUrl(item?.url);if(!url||!stable(item)){skipped++;continue;}
      const existing=get.get(url),old=existing?JSON.parse(existing.payload):null;
      const row=merge(old,{...item,url});put.run(url,JSON.stringify(row),new Date().toISOString());if(old)updated++;else added++;
    }db.exec('COMMIT');return {added,updated,skipped};}
    catch(error){db.exec('ROLLBACK');throw error;}
  }
  function allCandidates(){return db.prepare('SELECT payload FROM candidates ORDER BY updated_at DESC').all().map(row=>JSON.parse(row.payload));}
  function editCandidate(url,updates){const key=canonicalUrl(url);if(!key)throw Error('Invalid candidate URL.');
    const stored=get.get(key);if(!stored)throw Error('Candidate does not exist.');
    const allowed=['status','notes'];const edited={...JSON.parse(stored.payload)};
    for(const field of allowed)if(Object.hasOwn(updates||{},field)){
      if(typeof updates[field]!=='string'||updates[field].length>10000)throw Error('Invalid candidate value.');
      if(field==='status'&&!['new','reviewing','shortlisted','contacted','interview','rejected'].includes(updates[field]))throw Error('Invalid stage.');
      edited[field]=updates[field];
    }edited._desktopReviewUpdatedAt=new Date().toISOString();
    put.run(key,JSON.stringify(edited),new Date().toISOString());return edited;
  }
  function upsertEstablishments(rows){if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid establishment batch.');
    let added=0,updated=0,skipped=0;db.exec('BEGIN IMMEDIATE');try{
      for(const row of rows){if(!stable(row)||row.verified!==true||!row.sourceUrl||!row.name||!row.address||!Number.isFinite(Number(row.lat))||!Number.isFinite(Number(row.lon))){skipped++;continue;}
        const id=String(row.id||`${row.name}:${row.address}`).slice(0,300);const existing=establishmentGet.get(id);
        establishmentPut.run(id,JSON.stringify({...row,id}),new Date().toISOString());if(existing)updated++;else added++;
      }db.exec('COMMIT');return {added,updated,skipped};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  function allEstablishments(){return db.prepare('SELECT payload FROM establishments ORDER BY updated_at DESC').all().map(row=>JSON.parse(row.payload));}
  function registerToken(token,label){db.prepare('INSERT INTO client_tokens(hash,label,created_at) VALUES(?,?,?)').run(crypto.createHash('sha256').update(token).digest('hex'),String(label||'Chrome profile').slice(0,100),new Date().toISOString());}
  function verifyToken(token){if(typeof token!=='string'||token.length!==64||!/^[0-9a-f]+$/.test(token))return false;
    const hash=crypto.createHash('sha256').update(token).digest('hex');return Boolean(db.prepare('SELECT 1 FROM client_tokens WHERE hash=?').get(hash));
  }
  function clients(){return db.prepare('SELECT label,created_at FROM client_tokens ORDER BY created_at DESC').all();}
  function atlasProspects(){const statuses={},notes={};for(const row of db.prepare('SELECT id,status,notes FROM atlas_prospects').all()){
    statuses[row.id]=row.status;notes[row.id]=row.notes;
  }return {statuses,notes};}
  function updateAtlasProspect(id,updates){
    if(typeof id!=='string'||!id.trim()||id.length>300)throw Error('Invalid prospect identifier.');
    const existing=db.prepare('SELECT status,notes FROM atlas_prospects WHERE id=?').get(id)||{status:'New',notes:''};
    const status=updates&&Object.hasOwn(updates,'status')?updates.status:existing.status;
    const notes=updates&&Object.hasOwn(updates,'notes')?updates.notes:existing.notes;
    if(typeof status!=='string'||!['New','Researching','Shortlisted','Contacted','In discussion','Contract opportunity','Not relevant'].includes(status))throw Error('Invalid prospect stage.');
    if(typeof notes!=='string'||notes.length>20000)throw Error('Prospect note is too long.');
    db.prepare('INSERT INTO atlas_prospects(id,status,notes,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at').run(id,status,notes,new Date().toISOString());
    return {id,status,notes};
  }
  function allAtlasCustom(){return db.prepare('SELECT payload FROM atlas_custom ORDER BY updated_at').all().map(row=>JSON.parse(row.payload));}
  function upsertAtlasCustom(rows){
    if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid Atlas import.');
    let added=0,updated=0;db.exec('BEGIN IMMEDIATE');
    try{const getCustom=db.prepare('SELECT 1 FROM atlas_custom WHERE id=?');
      const putCustom=db.prepare('INSERT INTO atlas_custom(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
      for(const item of rows){
        if(!stable(item)||item.origin!=='manual'||!['candidate','operator','hq','depot'].includes(item.type)||
          typeof item.id!=='string'||!/^custom-[a-z0-9]{4,36}$/i.test(item.id)||
          typeof item.name!=='string'||!item.name.trim()||item.name.length>300||
          !Number.isFinite(Number(item.lat))||!Number.isFinite(Number(item.lng))||Math.abs(Number(item.lat))>90||Math.abs(Number(item.lng))>180)throw Error('Invalid manual Atlas pin.');
        if(getCustom.get(item.id))updated++;else added++;
        putCustom.run(item.id,JSON.stringify(item),new Date().toISOString());
      }db.exec('COMMIT');return {added,updated};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  // Contracts are independent assignments: candidate names can be entered manually, or linked
  // to a previously collected profile. The dates are recorded facts, not statutory defaults.
  const entities=['RS Univers Industrie','RS Univers Consulting','Mantingo'];
  const states=['planned','active','on_hold','completed','ended'];
  const renewals=['not_requested','under_review','confirmed','declined'];
  const decisions=['pending','yes','no'];
  const types=['subcontracting','cdi','cdd','other'];
  function strictDate(date,optional=false){
    if(optional&&date==='')return '';
    if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('A valid YYYY-MM-DD date is required.');
    const parsed=new Date(date+'T00:00:00.000Z');
    if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)throw Error('Invalid calendar date.');
    return date;
  }
  function cleanString(value,label,max=180,required=false){
    if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('Invalid '+label+'.');
    return value.trim();
  }
  function normalizeContract(input,existingId=''){
    if(!stable(input))throw Error('Invalid contract record.');
    const entity=cleanString(input.entity,'legal entity',100,true);
    if(!entities.includes(entity))throw Error('Unknown RS Univers entity.');
    const status=cleanString(input.status,'assignment status',30,true);
    const renewal=cleanString(input.renewal,'renewal status',30,true);
    const hireDecision=cleanString(input.hireDecision,'hiring decision',30,true);
    const contractType=cleanString(input.contractType,'contract type',30,true);
    if(!states.includes(status)||!renewals.includes(renewal)||!decisions.includes(hireDecision)||!types.includes(contractType))throw Error('Invalid contract status.');
    const startDate=strictDate(input.startDate);
    const initialEndDate=strictDate(input.initialEndDate);
    const renewalEndDate=strictDate(input.renewalEndDate||'',true);
    if(initialEndDate<startDate)throw Error('First probation end must be on or after the start date.');
    if(renewalEndDate&&renewalEndDate<=initialEndDate)throw Error('Renewal end must follow the first probation end.');
    if(renewal==='confirmed'&&!renewalEndDate)throw Error('A confirmed renewal needs an end date.');
    if(renewalEndDate&&renewal!=='confirmed')throw Error('Select confirmed renewal to set its end date.');
    const candidateUrl=input.candidateUrl?canonicalUrl(input.candidateUrl):'';
    if(input.candidateUrl&&!candidateUrl)throw Error('Invalid candidate profile URL.');
    if(candidateUrl&&!get.get(candidateUrl))throw Error('Linked candidate is not in the candidate directory.');
    const saved={
      id:existingId||crypto.randomUUID(),
      candidateName:cleanString(input.candidateName,'candidate name',160,true),
      candidateUrl,entity,
      clientCompany:cleanString(input.clientCompany||'','client company',200,true),
      role:cleanString(input.role||'','role',180,true),
      contractType,status,renewal,hireDecision,startDate,initialEndDate,renewalEndDate,
      notes:cleanString(input.notes||'','notes',5000),
      updatedAt:new Date().toISOString()
    };
    return saved;
  }
  function allContracts(){return db.prepare('SELECT payload FROM contracts ORDER BY updated_at DESC').all().map(row=>JSON.parse(row.payload));}
  function saveContract(input){
    const id=input&&typeof input.id==='string'?input.id:'';
    if(id&&(!/^[a-f0-9-]{36}$/i.test(id)||!db.prepare('SELECT 1 FROM contracts WHERE id=?').get(id)))throw Error('Contract not found.');
    const value=normalizeContract(input,id);
    db.prepare('INSERT INTO contracts(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(value.id,JSON.stringify(value),value.updatedAt);
    return value;
  }
  function importContracts(rows){
    if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid contracts import.');
    let imported=0;db.exec('BEGIN IMMEDIATE');
    try {
      const stmt=db.prepare('INSERT INTO contracts(id,payload,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at');
      for(const input of rows){
        const id=typeof input?.id==='string'&&/^[a-f0-9-]{36}$/i.test(input.id)?input.id:crypto.randomUUID();
        const value=normalizeContract(input,id);
        stmt.run(value.id,JSON.stringify(value),value.updatedAt);imported++;
      }
      db.exec('COMMIT');return {imported};
    }catch(error){db.exec('ROLLBACK');throw error;}
  }

  return {directory,allCandidates,upsertCandidates,editCandidate,allEstablishments,upsertEstablishments,registerToken,verifyToken,clients,atlasProspects,updateAtlasProspect,allAtlasCustom,upsertAtlasCustom,allContracts,saveContract,importContracts,close:()=>db.close()};
}
module.exports={createStore,canonicalUrl};
