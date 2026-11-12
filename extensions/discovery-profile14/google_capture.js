/* Captures the organic result cards currently displayed in a Google Search tab. */
function fleetbridgeExtractGoogleResults(){
  'use strict';
  if(!/(^|\.)google\.com$/.test(location.hostname)||location.pathname!=='/search')
    return {error:'Open a Google Search results page.'};
  const body=String(document.body?.innerText||'').slice(0,10000);
  if(document.querySelector('form[action*="/sorry/"]')||/unusual traffic from your computer network|not a robot|trafic inhabituel/i.test(body))
    return {error:'Google requested verification. Collection stopped; complete it manually.'};
  const rows=[],seen=new Set();
  for(const h3 of document.querySelectorAll('#search h3, #rso h3')){
    const a=h3.closest('a')||h3.parentElement?.closest('a');
    if(!a?.href||seen.has(a.href))continue;
    const title=String(h3.innerText||h3.textContent||'').trim();
    if(!title)continue;
    const card=h3.closest('.MjjYud, .g')||h3.parentElement?.parentElement?.parentElement;
    const sn=card?.querySelector('.VwiC3b, .yXK7lf, .aCOpRe, [data-sncf]');
    const snippet=String(sn?.innerText||'').trim().slice(0,900);
    rows.push({url:a.href,title,snippet});seen.add(a.href);
  }
  const next=document.querySelector('a#pnnext, a[aria-label="Next"], a[aria-label="Suivant"]');
  return {rows,nextUrl:next?.href||'',query:new URLSearchParams(location.search).get('q')||'',pageUrl:location.href};
}
if(typeof module!=='undefined'&&module.exports)module.exports=fleetbridgeExtractGoogleResults;
