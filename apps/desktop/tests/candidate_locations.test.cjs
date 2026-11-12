'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const source=require('../public/atlas/candidate-locations.js');
const employers=[
  {city:'Saint-Quentin',code:'FR',country:'France',lat:49.846,lng:3.287},
  {city:'Paris',code:'FR',country:'France',lat:48.8566,lng:2.3522},
  {city:'Lyon',code:'FR',country:'France',lat:45.764,lng:4.8357},
  {city:'Berlin',code:'DE',country:'Germany',lat:52.52,lng:13.405}
];
const candidate=(id,location)=>({url:`https://linkedin.com/in/${id}`,title:'Mechanic',profileCapture:{fields:{name:`Candidate ${id}`,location,headline:'Bus technician'}}});
test('recognizes abbreviated French cities without inventing street addresses',()=>{
  const hit=source.findCity('St.-Quentin, Hauts-de-France, France',employers);
  assert.equal(hit.code,'FR');assert.equal(hit.city,'Saint-Quentin');
  assert.match(hit.precision,/city centre/);
});
test('European city and Greater Paris labels match Atlas city centers',async()=>{
  const {mapped,unmapped}=await source.build([candidate('one','Berlin, Germany'),candidate('two','Greater Paris Metropolitan Region')],employers,{fetcher:null});
  assert.equal(unmapped,0);assert.equal(mapped[0].code,'DE');assert.equal(mapped[1].city,'Paris');
});
test('unknown city without verified location is not mapped at invented coordinates',async()=>{
  const {mapped,unmapped}=await source.build([candidate('nolocation','Unknown world')],employers,{fetcher:null});
  assert.equal(mapped.length,0);assert.equal(unmapped,1);
});
test('workplace geo fallback is correctly labeled as nonresidential evidence',async()=>{
  const row=candidate('work','');row.profileCapture.roles=[{title:'Mechanic',startDate:'2026-01',geo:{lat:48.9,lon:2.4,city:'Paris',countryCode:'FR'}}];
  const {mapped}=await source.build([row],employers,{fetcher:null});
  assert.equal(mapped.length,1);assert.match(mapped[0].precision,/workplace evidence, not a home address/);
});
test('official French commune fallback transmits only a city name and rejects ambiguous matches',async()=>{
  let requested='';const fetcher=async url=>{requested=url;return {ok:true,json:async()=>[{nom:'Brest',codeRegion:'53',centre:{coordinates:[-4.49,48.39]}}]};};
  const result=await source.build([candidate('brest','Brest, Bretagne, France')],[],{fetcher});
  assert.equal(result.mapped.length,1);assert.equal(result.mapped[0].code,'FR');
  assert.match(requested,/nom=Brest/);assert.doesNotMatch(requested,/Candidate|linkedin/);
});
test('uses an explicit country-tagged Google snippet city for unreviewed discovery links',async()=>{
  const row=candidate('discovery','');row.snippet='Lyon, Auvergne-Rhône-Alpes, France · Mécanicien de maintenance · Expérience : atelier';
  const {mapped,unmapped}=await source.build([row],employers,{fetcher:null});
  assert.equal(mapped.length,1);assert.equal(unmapped,0);
  assert.equal(mapped[0].city,'Lyon');
  assert.equal(mapped[0].locationEvidence,'Lyon, Auvergne-Rhône-Alpes, France');
});
test('rejects a search snippet without an explicit country location',async()=>{
  const row=candidate('role-text','');row.snippet='Mechanic, Renault Trucks · 4 years of experience';
  assert.equal(source.discoveryLocation(row.snippet),'');
  assert.equal((await source.build([row],employers,{fetcher:null})).unmapped,1);
});
