const test=require('node:test');
const assert=require('node:assert/strict');
const capture=require('../profile_capture.js');
const fullCapture=capture.fleetbridgeExtractFullExperience;

test('full Experience capture stays on selected profile and returns only visible dated text',()=>{
  const prev={document:global.document,location:global.location};
  try{
    global.location={hostname:'www.linkedin.com',pathname:'/in/example/details/experience/',href:'https://www.linkedin.com/in/example/details/experience/'};
    const main={innerText:'Expérience\nMécanicien de bus\nRATP\njanv. 2019 - aujourd’hui\nParis, France\nTechnicien\nKeolis\n2015 - 2018\nLille, France'};
    global.document={querySelector:()=>main};
    const out=fullCapture();
    assert.equal(out.ok,true);
    assert.equal(out.fullPage,true);
    assert.match(out.experienceText,/Lille, France/);
    assert.match(out.experienceText,/janv\. 2019/);
    global.location={hostname:'www.google.com',pathname:'/search'};
    assert.equal(fullCapture().ok,false);
  }finally{global.document=prev.document;global.location=prev.location;}
});

test('professional profile parser does not confuse whole-page navigation with name',()=>{
  const previous={document:global.document,location:global.location};
  try{
    const h1={innerText:'Jean Dupont',textContent:'Jean Dupont',parentElement:null};
    const top={innerText:'Jean Dupont\nMécanicien poids lourds chez RATP\nLyon, France\n500 relations',parentElement:null};h1.parentElement=top;
    const experience={innerText:'Expérience',closest:()=>({innerText:'Expérience\nMécanicien véhicules industriels\nEntreprise de transport\n2018 – Aujourd’hui'})};
    const about={innerText:'À propos',closest:()=>({innerText:'À propos\n12 ans de maintenance d’autocars'})};
    const main={querySelector:selector=>selector==='h1'?h1:null,querySelectorAll:()=>[experience,about]};
    global.document={querySelector:()=>main};global.location={hostname:'www.linkedin.com',pathname:'/in/jean-dupont',href:'https://www.linkedin.com/in/jean-dupont'};
    const result=capture();assert.equal(result.ok,true);
    assert.equal(result.fields.name,'Jean Dupont');assert.equal(result.fields.location,'Lyon, France');
    assert.equal(result.fields.headline,'Mécanicien poids lourds chez RATP');
    assert.match(result.fields.experience,/Entreprise de transport/);
  }finally{global.document=previous.document;global.location=previous.location;}
});
test('rejects non-LinkedIn page',()=>{
  const old=global.location;global.location={hostname:'www.google.com',pathname:'/search'};
  try{assert.equal(capture().ok,false);}finally{global.location=old;}
});
test('does not silently invent identity when the header is absent',()=>{
  const prev={document:global.document,location:global.location};
  try{global.location={hostname:'linkedin.com',pathname:'/in/someone',href:'https://linkedin.com/in/someone'};
    global.document={querySelector:()=>({querySelector:()=>null,querySelectorAll:()=>[]})};
    const out=capture();assert.equal(out.fields.name,'');assert.equal(out.confidence,'low');
  }finally{global.document=prev.document;global.location=prev.location;}
});
test('uses the browser-tab title for name and short visible main text for headline; finds ID-anchored experience',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const section={innerText:'Expérience\nTechnicien mécanique\nToyota\n2018 - 2026'};
    const anchor={getClientRects:()=>[{}],closest:()=>section};
    const main={innerText:'Raphaël HAINAUT\nTechnicien secteur automobile chez Toyota\nOnnaing, Hauts-de-France, France',
      querySelector:selector=>selector==='[id="experience"]'?anchor:null,querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/raphael-hainaut',href:'https://www.linkedin.com/in/raphael-hainaut'};
    global.document={title:'Raphaël HAINAUT - Technicien secteur automobile | LinkedIn',querySelector:()=>main,querySelectorAll:()=>[]};
    const out=capture();assert.equal(out.ok,true);
    assert.equal(out.fields.name,'Raphaël HAINAUT');
    assert.equal(out.fields.headline,'Technicien secteur automobile chez Toyota');
    assert.equal(out.fields.location,'Onnaing, Hauts-de-France, France');
    assert.match(out.fields.experience,/Toyota/);
    assert.equal(out.diagnostics.nameSource,'browser title');
    assert.equal(out.diagnostics.sectionSources.experience,'section anchor');
  }finally{global.document=prev.document;global.location=prev.location;}
});

test('extracts only Experience from zero-height LinkedIn ID anchors inside visible cards',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const name={innerText:'Raphaël HAINAUT',getClientRects:()=>[{}],parentElement:null};
    const top={innerText:'Raphaël HAINAUT\nTechnicien secteur automobile chez Toyota\nOnnaing, Hauts-de-France, France',parentElement:null};
    name.parentElement=top;
    const cards={
      experience:{innerText:'Expérience\nTechnicien secteur automobile\nToyota\n2020 - aujourd’hui',getClientRects:()=>[{}]},
      education:{innerText:'Formation\nBTS Maintenance des véhicules\n2015 - 2017',getClientRects:()=>[{}]}
    };
    const anchors=Object.fromEntries(Object.entries(cards).map(([key,card])=>[key,{
      getClientRects:()=>[],closest:selector=>selector.includes('artdeco-card')?card:null
    }]));
    const main={innerText:top.innerText,querySelector:selector=>{
      if(selector==='h1')return name;
      const match=selector.match(/^\[id="([^"]+)"\]$/);
      return match?anchors[match[1]]||null:null;
    },querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/raphael-hainaut',href:'https://www.linkedin.com/in/raphael-hainaut'};
    global.document={title:'Raphaël HAINAUT | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.equal(out.ok,true);
    assert.match(out.fields.experience,/2020 - aujourd’hui/);
    assert.equal(Object.hasOwn(out.fields,'education'),false);
    assert.equal(out.diagnostics.anchorsFound,1);
    assert.equal(out.confidence,'high');
  }finally{global.document=prev.document;global.location=prev.location;}
});

test('rejects messaging prompts masquerading as an About card and rates title-only identity as low confidence',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const chatter={innerText:'À propos\nAppuyez sur Entrée pour ouvrir la liste de conversations.\nRédiger un message\nVous êtes dans la fenêtre de messagerie.',getClientRects:()=>[{}]};
    const heading={innerText:'À propos',getClientRects:()=>[{}],closest:()=>chatter};
    const main={innerText:'Pour les entreprises\nActivez Premium pour 0 €',
      querySelector:()=>null,querySelectorAll:selector=>selector.startsWith('h2')?[heading]:[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/raphael-hainaut',href:'https://www.linkedin.com/in/raphael-hainaut'};
    global.document={title:'Raphaël HAINAUT - Technicien secteur automobile | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.equal(out.fields.name,'Raphaël HAINAUT');
    assert.equal(Object.hasOwn(out.fields,'about'),false);
    assert.equal(out.fields.headline,'Technicien secteur automobile');
    assert.equal(out.confidence,'low');
    assert.equal(out.diagnostics.nameSource,'browser title');
  }finally{global.document=prev.document;global.location=prev.location;}
});

test('recovers Experience from visible text boundaries while ignoring other sections',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const main={innerText:[
      'Raphaël HAINAUT','Technicien secteur automobile chez Toyota','Onnaing, Hauts-de-France, France',
      'À propos','Technicien de maintenance de véhicules industriels et autocars depuis plus de dix ans.',
      'Expérience','Mécanicien poids lourds','Toyota GCA Péruwelz','mai 2018 - aujourd’hui',
      'Formation','BTS maintenance des véhicules industriels','Lycée technique 2015 - 2017',
      'Compétences','Entretien des autobus','Diagnostic électrique','Hydraulique'
    ].join('\n'),querySelector:()=>null,querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/raphael-hainaut',href:'https://www.linkedin.com/in/raphael-hainaut'};
    global.document={title:'Raphaël HAINAUT - Technicien secteur automobile | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.equal(out.ok,true);
    assert.match(out.fields.experience,/Toyota GCA Péruwelz/);
    assert.equal(Object.hasOwn(out.fields,'education'),false);
    assert.equal(Object.hasOwn(out.fields,'skills'),false);
    assert.equal(out.diagnostics.textBoundaryFallback,true);
    assert.equal(out.diagnostics.sectionSources.experience,'visible text boundaries (verify)');
    assert.match(out.problems.join(' '),/Check their start and end/);
  }finally{global.document=prev.document;global.location=prev.location;}
});
test('single visible Experience section with dated roles is enough for fallback',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const main={innerText:'Raphaël HAINAUT\nMécanicien poids lourds\nOnnaing, France\nExpérience\nTechnicien bus\nRATP\nmars 2020 - aujourd’hui',querySelector:()=>null,querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/raphael',href:'https://www.linkedin.com/in/raphael'};
    global.document={title:'Raphaël HAINAUT - Mécanicien poids lourds | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.match(out.fields.experience,/mars 2020 - aujourd’hui/);
    assert.deepEqual(Object.keys(out.fields),['name','headline','location','experience']);
  }finally{global.document=prev.document;global.location=prev.location;}
});
test('captures Montréal et périphérie as Location and never includes Coordonnées or connection count',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const name={innerText:'Yassine BOUDA',getClientRects:()=>[{}],parentElement:null};
    const top={innerText:[
      'Yassine BOUDA',
      'mécanicien poids lourds et équipements agricoles et de chantier avec expérience',
      'ISTA SIDI MAAFA OUJDA',
      'Montréal et périphérie · Coordonnées',
      '78 relations',
      'Se connecter',
      'Message'
    ].join('\n'),parentElement:null};
    name.parentElement=top;
    const main={innerText:top.innerText,querySelector:selector=>selector==='h1'?name:null,querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/yassine-bouda',href:'https://www.linkedin.com/in/yassine-bouda'};
    global.document={title:'Yassine BOUDA | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.equal(out.fields.location,'Montréal et périphérie');
    assert.equal(out.fields.headline,'mécanicien poids lourds et équipements agricoles et de chantier avec expérience');
    assert.doesNotMatch(out.fields.location,/coordonnées|relations|message/i);
  }finally{global.document=prev.document;global.location=prev.location;}
});
test('finds regional location when profile name is only available from tab title',()=>{
  const prev={document:global.document,location:global.location};
  try{
    const main={innerText:'Yassine BOUDA\nMécanicien poids lourds\nMontréal et périphérie · Coordonnées\n78 relations',querySelector:()=>null,querySelectorAll:()=>[]};
    global.location={hostname:'www.linkedin.com',pathname:'/in/yassine-bouda',href:'https://www.linkedin.com/in/yassine-bouda'};
    global.document={title:'Yassine BOUDA - Mécanicien poids lourds | LinkedIn',body:{},querySelector:()=>main};
    const out=capture();
    assert.equal(out.fields.location,'Montréal et périphérie');
  }finally{global.document=prev.document;global.location=prev.location;}
});
