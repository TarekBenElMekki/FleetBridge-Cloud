/* Keep the original IndexedDB name and object store for in-place upgrades. */
(function(root){
  'use strict';
  const DB_NAME='fleetbridge-search-collector',STORE='profiles';
  function openDb(){return new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE)){
      const s=d.createObjectStore(STORE,{keyPath:'url'});s.createIndex('lastSeen','lastSeen');s.createIndex('status','status');
    }};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
  });}
  async function all(){const db=await openDb();try{return await new Promise((resolve,reject)=>{
    const r=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);
  });}finally{db.close();}}
  async function putMany(rows){if(!rows.length)return;const db=await openDb();try{await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),s=tx.objectStore(STORE);
    for(const row of rows)s.put(row);
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}}
  async function save(row){await putMany([row]);}
  async function captureGoogle(rows,query){
    const current=new Map((await all()).map(r=>[FB.canonicalUrl(r.url),r]));
    let added=0,existing=0;const touched=new Set();
    for(const item of rows){const key=FB.canonicalUrl(item.url);if(!key)continue;
      const before=current.get(key);if(!touched.has(key)){if(before)existing++;else added++;}
      current.set(key,FB.mergeDiscovery(before,item,query));touched.add(key);
    }
    await putMany([...touched].map(url=>current.get(url)));return {added,existing};
  }
  async function restore(rows){
    if(!Array.isArray(rows))throw new Error('Backup must contain an array of candidate records.');
    if(rows.length>100000)throw new Error('Backup exceeds the 100,000-record safety limit.');
    const current=new Map((await all()).map(r=>[FB.canonicalUrl(r.url),r]));let added=0,updated=0;
    const changed=new Map();
    for(const item of rows){const key=FB.canonicalUrl(item?.url);if(!key)continue;
      const before=current.get(key);if(before)updated++;else added++;
      const candidate={...(before||FB.newRecord(key)),...item,url:key};
      if(item.profileImport&&typeof item.profileImport==='object'&&item.profileImport.importedAt){
        // Keep all fields from older backups and pre-existing records; only the
        // four active fields are normalized and shown in the new review UI.
        const combined={...(before?.profileImport||{}),...item.profileImport};
        candidate.profileImport={...combined,...FB.normalizeProfile(combined),
          experienceSummary:FB.summarizeExperience(combined.experience),
          sourceMethod:FB.clean(combined.sourceMethod,60),importedAt:FB.clean(combined.importedAt,60)};
      }else candidate.profileImport=before?.profileImport||null;
      candidate.sourceQueries=[...new Set([...(before?.sourceQueries||[]),...(Array.isArray(item.sourceQueries)?item.sourceQueries:[])].filter(x=>typeof x==='string'))].slice(-50);
      current.set(key,candidate);changed.set(key,candidate);
    }
    await putMany([...changed.values()]);return {added,updated};
  }
  root.FBDB={all,save,captureGoogle,restore};
})(globalThis);
