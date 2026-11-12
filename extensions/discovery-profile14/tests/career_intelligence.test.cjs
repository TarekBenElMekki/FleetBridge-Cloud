const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../career_intelligence.js');
const G=require('../fr_geo.js');
const FB=require('../core.js');

test('full French experience is split into jobs; summary merges concurrent intervals',()=>{
  const text=`Mécanicien bus\nRATP · CDI\njanv. 2017 - déc. 2021\nParis, France\nTechnicien de maintenance\nKeolis\nmars 2020 - août 2022\nLille, France\nMécanicien poids lourds\nRenault Trucks\nsept. 2022 - aujourd’hui\nLyon, France`;
  const jobs=C.parseExperience(text,new Date(2026,10,4));
  assert.equal(jobs.length,3);
  assert.deepEqual(jobs.map(j=>j.company),['RATP','Keolis','Renault Trucks']);
  assert.deepEqual(jobs.map(j=>j.locationRaw),['Paris, France','Lille, France','Lyon, France']);
  const sum=C.summary(jobs,new Date(2026,10,4));
  assert.equal(sum.totalMonths,119); // Jan 2017–Nov 2026 with overlapping periods
  assert.equal(sum.latestCompany,'Renault Trucks');
  assert.equal(sum.latestMonths,51);
});

test('different French departments in one region are not called interregional',()=>{
  const geo=(city,regionCode,departmentCode,lat,lon)=>({city,regionCode,departmentCode,region:C.FR_REGIONS[regionCode],countryCode:'FR',lat,lon});
  const jobs=[
    {startDate:'2017-01',endDate:'2020-01',geo:geo('Lille','32','59',50.63,3.06)},
    {startDate:'2021-01',endDate:'2024-12',geo:geo('Arras','32','62',50.29,2.78)},
    {startDate:'2025-01',current:true,geo:geo('Lyon','84','69',45.76,4.84)}
  ];
  const result=C.assessMobility(jobs,null,'unknown');
  assert.equal(result.distinctFrenchRegions,2);
  assert.equal(result.distinctCountries,1);
  assert.equal(result.label,'Interregional work history in France');
  assert.match(result.explanation,/do not prove residence moves/);
  const same=C.assessMobility(jobs.slice(0,2));
  assert.equal(same.distinctFrenchRegions,1);
  assert.notEqual(same.label,'Interregional work history in France');
});

test('country A to B to A return detected, without pretending relocation probability',()=>{
  const place=(raw)=>C.offlineGeocode(raw);
  const jobs=[
    {startDate:'2015-01',endDate:'2017-12',geo:place('Tunis, Tunisia')},
    {startDate:'2018-01',endDate:'2021-12',geo:place('Montreal, Canada')},
    {startDate:'2022-01',endDate:'2025-12',geo:place('Sfax, Tunisia')}
  ];
  const assessment=C.assessMobility(jobs,null,'yes');
  assert.equal(assessment.internationalReturn,true);
  assert.equal(assessment.distinctCountries,2);
  assert.match(assessment.label,/return/i);
  assert.match(assessment.explanation,/explicitly confirmed willingness/);
  assert.equal('relocationProbability' in assessment,false);
});

test('unknown jobs and overlapping work do not create invented distance',()=>{
  const records=[
    {startDate:'2020-01',endDate:'2024-01',geo:C.offlineGeocode('Tunis, Tunisia')},
    {startDate:'2021-01',endDate:'2023-01',geo:C.offlineGeocode('Sfax, Tunisia')},
    {startDate:'2025-01',endDate:'2026-01',geo:null}
  ];
  const assessment=C.assessMobility(records);
  assert.equal(assessment.maximumWorkplaceDistanceKm,null);
  assert.equal(assessment.coverage,'2/3');
});

test('French geocoder uses a named exact commune and official region rather than department as region',async()=>{
  const fetcher=async url=>{
    assert.match(url,/geo\.api\.gouv\.fr\/communes/);
    assert.match(url,/nom=Paris/);
    return {ok:true,json:async()=>[{nom:'Paris',code:'75056',codeDepartement:'75',codeRegion:'11',centre:{coordinates:[2.35,48.85]}}]};
  };
  const {geo}=await G.resolveLocation('Paris, France',fetcher);
  assert.equal(geo.region,'Île-de-France');
  assert.equal(geo.departmentCode,'75');
  assert.equal(geo.regionCode,'11');
  assert.equal(geo.countryCode,'FR');
});

test('ambiguous French towns and unknown foreign cities remain unresolved',async()=>{
  const fetcher=async()=>({ok:true,json:async()=>[
    {nom:'Saint-Martin',codeRegion:'11',centre:{coordinates:[2,48]}},
    {nom:'Saint-Martin',codeRegion:'75',centre:{coordinates:[1,44]}}
  ]});
  assert.equal((await G.resolveLocation('Saint-Martin, France',fetcher)).geo,null);
  const foreign=await G.resolveLocation('Somewhere Unknown, Tunisia',()=>{throw new Error('No external lookup expected');});
  assert.equal(foreign.geo,null);
});

test('work-authorization screening is an evidence checklist, not a visa prediction',()=>{
  const unknown=C.assessFranceWork();
  assert.equal(unknown.status,'Information required');
  assert.ok(unknown.missingInformation.length>=4);
  assert.equal('visaProbability' in unknown,false);
  const potential=C.assessFranceWork({citizenshipGroup:'non_eu',workRights:'verified_no',residence:'abroad',
    jobTitle:'Mécanicien poids lourds',jobRegion:'Hauts-de-France',contractType:'CDI',employerApplies:'yes',shortageRoute:'yes'});
  assert.equal(potential.status,'Potential employer authorization route');
  assert.match(potential.next,/visa/i);
  const noEmployer=C.assessFranceWork({citizenshipGroup:'non_eu',workRights:'verified_no',employerApplies:'no'});
  assert.equal(noEmployer.status,'Employer action not available');
});

test('manual review stores structured roles and exports statuses while retaining existing notes',()=>{
  const existing={...FB.newRecord('https://www.linkedin.com/in/test-one'),notes:'keep note',profileImport:{customLegacyField:'keep'}};
  const roles=C.parseExperience('Technicien\nKeolis\n2020 - 2025\nLille, France');
  const record=FB.mergeReview(existing,existing.url,{name:'Jean Dupont',headline:'Technicien',experience:'Technicien\nKeolis\n2020 - 2025'},'explicit_click',
    {roles,mobility:{label:'Insufficient geographic evidence',coverage:'0/1'},franceWork:{status:'Information required'}});
  assert.equal(record.notes,'keep note');
  assert.equal(record.profileImport.customLegacyField,'keep');
  assert.equal(record.profileImport.experienceRoles.length,1);
  assert.equal(record.profileImport.experienceSummary.latestCompany,'Keolis');
  const csv=FB.toCsv([record]);
  assert.match(csv,/profileImport\.mobility\.label/);
  assert.match(csv,/Insufficient geographic evidence/);
  assert.match(csv,/Information required/);
});
