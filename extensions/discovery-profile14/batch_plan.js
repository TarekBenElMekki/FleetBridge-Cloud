/* Pure, deterministic planning for bounded Google results collection.
   Deduplication happens before IndexedDB writes. No LinkedIn requests. */
(function(root){
  'use strict';
  const LINK_TARGET=250;
  const PAGE_CAP=40;
  function options(message={}){
    if(message.mode==='links250'||Number(message.targetLinks)===LINK_TARGET){
      return {mode:'links250',targetLinks:LINK_TARGET,maxPages:PAGE_CAP};
    }
    const pages=Number(message.maxPages);
    if(![5,10,20].includes(pages))throw new Error('Choose 250 unique links or 5, 10, 20 pages.');
    return {mode:'pages',targetLinks:0,maxPages:pages};
  }
  function select(rows=[],previous=[],targetLinks=0,canonicalUrl){
    if(typeof canonicalUrl!=='function')throw new Error('A canonical LinkedIn URL validator is required.');
    const seen=new Set((previous||[]).map(canonicalUrl).filter(Boolean));
    const accepted=[];
    let duplicates=0,invalid=0,overTarget=0,eligible=0;
    for(const row of rows||[]){
      const key=canonicalUrl(row?.url);
      if(!key){invalid++;continue;}
      eligible++;
      if(seen.has(key)){duplicates++;continue;}
      if(targetLinks>0&&seen.size>=targetLinks){overTarget++;continue;}
      seen.add(key);
      accepted.push({...row,url:key});
    }
    return {rows:accepted,seenUrls:[...seen],uniqueAdded:accepted.length,duplicates,invalid,overTarget,eligible};
  }
  const api={LINK_TARGET,PAGE_CAP,options,select};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBBatch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
