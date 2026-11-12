/* Executed only after the user clicks Capture on an open LinkedIn profile.
   No requests, automation, hidden nodes, or actions on the host page. */
function fleetbridgeExtractVisibleProfile(){
  'use strict';
  const fields={name:'',headline:'',location:'',experience:''};
  const problems=[];
  const fold=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  const text=node=>String(node?.innerText??node?.textContent??'').replace(/\r\n?/g,'\n').trim();
  const visible=node=>!!node&&(!node.getClientRects||node.getClientRects().length>0);
  const isNoise=line=>/^(accueil|home|messagerie|messaging|notifications|pour les entreprises|for business|se connecter|sign in|message|suivre|follow|plus|more|profil|profile|people also viewed|personnes egalement consultees|vous connaissez peut-etre|recommended for you|recommandations|activite|activity|publications|posts|interets|interests)$/i.test(fold(line))||
    /(activez? premium|appuyez sur entr[eé]e|fen[eê]tre de messagerie|liste de conversations|r[eé]diger un message|afficher (?:plus|tous|toutes|les)|voir le profil|voir plus|show more|see all|cookies?|ouvrir la liste de conversations|rejoignez linkedin|join linkedin)/i.test(fold(line));
  const lines=node=>text(node).split(/\n/).map(x=>x.trim()).filter(x=>x&&!isNoise(x));
  const cleanLines=node=>{
    const result=[];
    for(const line of lines(node))if(fold(line)!==fold(result[result.length-1]))result.push(line);
    return result;
  };
  const plausibleName=value=>{
    const name=String(value||'').trim();
    return name.length>=3&&name.length<=110&&/\p{L}/u.test(name)&&
      name.split(/\s+/).length>=2&&name.split(/\s+/).length<=7&&
      !isNoise(name)&&!/(linkedin|connexion|connectez|sign in|join now|inscrivez|premium|public profile)/i.test(fold(name));
  };
  // Profile locations can be displayed as "Montréal et périphérie · Coordonnées"
  // with no country. Only examine text near the profile heading; discard the
  // clickable contact label, network count and social action fragments.
  const profileLocation=value=>{
    const raw=String(value||'').split(/\s*[·•|]\s*/)[0].trim();
    const normalized=fold(raw);
    if(raw.length<3||raw.length>160||/\d+\s*(relations|connections|followers|abonnes)/i.test(normalized)||
      /\+\s*\d+\s*(de plus|more)|\b(sur site|on site|remote|teletravail)\b/i.test(normalized)||
      /\b(mecanicien|technicien|mechanic|technician|maintenance|engineer|manager)\b/i.test(normalized)||isNoise(raw))return '';
    if(/\b(et peripherie|et environs|and surrounding area|metropolitan area|greater [a-z -]+ area|region (de|du|d')|montreal|quebec|paris|lyon|lille|marseille|tunis|tunisie|canada|belgique|suisse|germany|allemagne|france|london|region|metropole)\b/i.test(normalized))return raw;
    return '';
  };
  const headingMap={
    about:['about','a propos','infos','summary'],
    experience:['experience','experiences','parcours professionnel','experience professionnelle'],
    education:['education','formation','formations','etudes'],
    skills:['skills','competences','competences principales','aptitudes'],
    languages:['languages','langues'],
    certifications:['certifications','licences et certifications','licences et certificats','licenses & certifications'],
    projects:['projects','projets'],volunteering:['volunteering','benevolat','engagement associatif','volunteer experience']
  };
  const sectionKey=v=>{
    const t=fold(v).replace(/[:.]+$/,'');
    for(const [key,names] of Object.entries(headingMap))if(names.some(n=>t===n||t===n+' '+n||t===n+n||t.startsWith(n+'\n')))return key;
    return '';
  };
  const host=location.hostname.toLowerCase();
  if(!/(^|\.)linkedin\.com$/.test(host)||!/^\/in\/[^/]+/i.test(location.pathname))
    return {ok:false,error:'Open an individual LinkedIn /in/ profile in the main tab first.'};
  // Prefer LinkedIn's profile column over global navigation, floating messaging,
  // job recommendations and right-rail cards whenever the column exists.
  const main=document.querySelector('main .scaffold-layout__main, .scaffold-layout__main, main, [role="main"]')||document.body;
  if(!main)return {ok:false,error:'LinkedIn has not rendered any page content. Wait for it to load and try again.'};
  if(main===document.body)problems.push('No main profile landmark was found; extraction used visible page headings only.');
  // LinkedIn uses different wrappers across desktop, international and guest layouts.
  // Inspect visible heading candidates on this profile, not the global navigation text.
  const headingsOne=[main.querySelector?.('h1'),...(main.querySelectorAll?.('h1, .text-heading-xlarge')||[])];
  let header=null;
  for(const candidate of headingsOne){
    if(!visible(candidate))continue;
    const possible=cleanLines(candidate)[0]||'';
    if(plausibleName(possible)){fields.name=possible;header=candidate;break;}
  }
  // The browser tab title is visible to the user, and is a safer fallback than
  // arbitrary page text when LinkedIn renders the name without an <h1>.
  if(!fields.name){
    const title=String(document.title||'').replace(/\s*[|·]\s*LinkedIn.*$/i,'').trim();
    const guessed=title.split(/\s+[-–—]\s+/)[0].trim();
    if(plausibleName(guessed)){fields.name=guessed;problems.push('Name came from the browser tab title, not a verified profile heading. Please confirm it.');}
  }
  if(!fields.name)problems.push('No trustworthy name was found. Leave it blank or enter it after checking the page.');

  // Only inspect the block surrounding the profile's visible <h1>, never global navigation.
  if(visible(header)){
    let container=header.parentElement;
    for(let depth=0;depth<5&&container;depth++,container=container.parentElement){
      if(container===main)break;
      const l=cleanLines(container);
      if(l.length>=3&&l.length<=40){
        const after=l.slice(Math.max(0,l.findIndex(x=>x===fields.name)+1),Math.max(0,l.findIndex(x=>x===fields.name)+1)+12);
        const job=after.find(x=>x!==fields.name&&x.length<300&&
          /(m[eé]canicien|technicien|maintenance|mechanic|diesel|poids lourds|bus|atelier|chez | at |engineer|manager|consultant|developer|chauffeur)/i.test(x));
        const place=after.map(profileLocation).find(Boolean);
        if(job&&!fields.headline)fields.headline=job;
        if(place&&!fields.location)fields.location=place;
      }
      if(fields.headline&&fields.location)break;
    }
  }
  // With some LinkedIn layouts the header is styled text, or the name is only
  // present in the tab title. Search a short region AFTER the exact name in the
  // rendered main column, never the whole page for arbitrary candidate data.
  if(fields.name&&(!fields.headline||!fields.location)){
    const l=cleanLines(main).slice(0,100);
    const index=l.findIndex(line=>fold(line)===fold(fields.name));
    if(index>=0){
      const near=l.slice(index+1,index+15);
      if(!fields.headline){
        fields.headline=near.find(x=>x.length<300&&
          /(m[eé]canicien|technicien|maintenance|mechanic|poids lourds|bus|atelier|ing[eé]nieur|engineer|manager|consultant|developer|chauffeur)/i.test(x)&&!isNoise(x))||'';
      }
      if(!fields.location){
        fields.location=near.map(profileLocation).find(Boolean)||'';
      }
    }
  }
  if(!fields.headline){
    const title=String(document.title||'').replace(/\s*[|·]\s*LinkedIn.*$/i,'').trim();
    const parts=title.split(/\s+[-–—]\s+/);
    if(parts.length>=2&&fold(parts[0])===fold(fields.name)&&
      /(m[eé]canicien|technicien|maintenance|mechanic|poids lourds|bus|atelier|ing[eé]nieur|engineer|manager)/i.test(parts[1])){
      fields.headline=parts[1].slice(0,300);problems.push('Headline came from the browser tab title; verify it before saving.');
    }
  }
  if(!fields.headline)problems.push('No trustworthy professional headline was visible near the profile name.');

  const headings=[...(main.querySelectorAll?.('h2, h3, [role="heading"], .pvs-header__title')||[])];
  const sectionSources=new Map();
  const anchorIds={experience:['experience']};
  let anchorsFound=0,cardsExamined=0;
  const findCard=(node)=>{
    if(!node)return null;
    // Many LinkedIn #experience/#education anchors are zero-size elements inside
    // a visible card. Check visibility on the enclosing card, not on the anchor.
    const card=node.closest?.('.artdeco-card, .pv-profile-card, .pv-profile-section, article')||
      node.closest?.('section')||node.parentElement?.parentElement;
    return card&&card!==main&&card!==document.body&&visible(card)?card:null;
  };
  const extractCard=(key,card,source)=>{
    if(fields[key]||!card)return false;
    cardsExamined++;
    const content=cleanLines(card);
    // Avoid accidentally treating an enclosing full-page layout as one section.
    if(content.length>180||text(card).length>26000)return false;
    const meaningful=content.filter(line=>!sectionKey(line)&&!isNoise(line)&&
      !/^(voir les \d+ exp[eé]riences|afficher les \d+ exp[eé]riences|show all \d+|voir toutes les|show all|afficher plus|voir plus|like|comment|share|j'aime|commenter|partager)$/i.test(fold(line)));
    const joined=meaningful.join('\n').slice(0,20000);
    if(joined.length<10)return false;
    fields[key]=joined;
    sectionSources.set(key,source);
    return true;
  };
  // ID anchors are more reliable than headings on modern LinkedIn layouts:
  // section headings are often styled spans or duplicated accessible labels.
  for(const [key,ids] of Object.entries(anchorIds)){
    for(const id of ids){
      const anchor=main.querySelector?.(`[id="${id}"]`);
      if(!anchor)continue;
      anchorsFound++;
      if(extractCard(key,findCard(anchor),'section anchor'))break;
    }
  }
  for(const h of headings){
    if(!visible(h))continue;
    const key=sectionKey(text(h))||sectionKey(cleanLines(h)[0]);
    if(key!=='experience'||fields.experience)continue;
    extractCard(key,findCard(h),'visible heading');
  }
  // Fall back to visible text boundaries only when the user has a recognizably
  // dated Experience block in the profile main column, never the whole page.
  let textBoundaryFallback=false;
  if(main!==document.body){
    const rendered=cleanLines(main).slice(0,700);
    const endHeading=line=>/^(activity|activit[eé]|posts|publications|recommendations|recommandations|interests|centres d.int[eé]r[eê]t|people also viewed|personnes [eé]galement consult[eé]es|people you may know|vous connaissez peut.[eê]tre)$/i.test(fold(line));
    const markers=[];
    for(let index=0;index<rendered.length;index++){
      const key=sectionKey(rendered[index]);
      if(key)markers.push({index,key});
      else if(endHeading(rendered[index]))markers.push({index,key:''});
    }
    const experienceIndex=markers.findIndex(marker=>marker.key==='experience');
    const nextMarker=experienceIndex<0?null:markers[experienceIndex+1];
    const start=experienceIndex<0?0:markers[experienceIndex].index+1;
    const boundary=nextMarker?.index??rendered.length;
    const experienceText=rendered.slice(start,Math.min(boundary,start+170)).join(' ');
    const hasDatedExperience=/(?:19|20)\d{2}\s*(?:[-–—]|\bto\b|\bau\b|\bà\b)\s*(?:(?:[A-Za-zÀ-ÿ.]{3,16}\s+)?(?:19|20)\d{2}|aujourd|present|présent|current)/i.test(experienceText)||
      /[A-Za-zÀ-ÿ.]{3,16}\s+(?:19|20)\d{2}\s*[-–—]\s*[A-Za-zÀ-ÿ.]{3,16}\s+(?:19|20)\d{2}/i.test(experienceText);
    if(experienceIndex>=0&&hasDatedExperience){
      for(let m=0;m<markers.length;m++){
        const {index,key}=markers[m];
        if(key!=='experience'||fields.experience)continue;
        const boundary=markers[m+1]?.index??rendered.length;
        const content=rendered.slice(index+1,Math.min(boundary,index+145)).filter(line=>!isNoise(line)&&!sectionKey(line));
        const joined=content.join('\n').slice(0,20000);
        if(joined.length<22)continue;
        fields[key]=joined;
        sectionSources.set(key,'visible text boundaries (verify)');
        textBoundaryFallback=true;
      }
    }
  }
  const sections=fields.experience?['experience']:[];
  if(!sections.length)problems.push('No visible Experience section was found. Scroll to Experience and capture again.');
  if(textBoundaryFallback)problems.push('Some sections were inferred from visible text boundaries. Check their start and end before saving.');
  const confidence=header&&fields.name&&fields.headline&&fields.experience?'high':
    fields.name&&fields.headline&&fields.experience?'medium':'low';
  const diagnostics={mainFound:main!==document.body,visibleHeadings:headings.filter(visible).length,
    recognizedSections:sections.length,sectionSources:Object.fromEntries(sectionSources),
    anchorsFound,cardsExamined,mainTextLines:cleanLines(main).length,textBoundaryFallback,
    nameSource:header?'heading':fields.name?'browser title':'missing'};
  return {ok:true,url:location.href,fields,sections,confidence,problems,diagnostics,capturedAt:new Date().toISOString()};
}
if(typeof module!=='undefined'&&module.exports)module.exports=fleetbridgeExtractVisibleProfile;
