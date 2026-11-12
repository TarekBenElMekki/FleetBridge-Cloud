'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createStore}=require('../store');
function temporary(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fleetbridge-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
const item=(id,extra={})=>({url:`https://www.linkedin.com/in/${id}/?ref=google`,title:'Mechanic',status:'new',sourceQueries:['mechanic'],...extra});
test('SQLite candidate records persist across app restart',t=>{
  const dir=temporary(t),one=createStore(dir);one.upsertCandidates([item('alpha')]);one.close();
  const two=createStore(dir);t.after(()=>two.close());assert.equal(two.allCandidates().length,1);
  assert.equal(two.allCandidates()[0].url,'https://linkedin.com/in/alpha');
});
test('identical people from two Chrome profiles deduplicate',t=>{
  const db=createStore(temporary(t));t.after(()=>db.close());
  db.upsertCandidates([item('same'),item('other')]);const result=db.upsertCandidates([item('SAME',{title:'Updated title'})]);
  assert.equal(result.updated,1);assert.equal(db.allCandidates().length,2);
});
test('new Google recapture cannot erase approved CRM stage or review',t=>{
  const db=createStore(temporary(t));t.after(()=>db.close());
  db.upsertCandidates([item('alpha',{status:'shortlisted',notes:'Call Tuesday',profileImport:{name:'Approved',importedAt:'2026-11-01T12:00:00Z'}})]);
  db.editCandidate('https://linkedin.com/in/alpha',{status:'shortlisted',notes:'Call Tuesday'});
  db.upsertCandidates([item('alpha',{status:'new',notes:'',profileImport:null})]);
  const row=db.allCandidates()[0];assert.equal(row.status,'shortlisted');assert.equal(row.notes,'Call Tuesday');assert.equal(row.profileImport.name,'Approved');
});
test('Chrome review changes arrive until a desktop recruiter takes ownership',t=>{
  const db=createStore(temporary(t));t.after(()=>db.close());
  db.upsertCandidates([item('alpha')]);db.upsertCandidates([item('alpha',{status:'reviewing',notes:'Reviewed in sidebar'})]);
  assert.equal(db.allCandidates()[0].status,'reviewing');assert.equal(db.allCandidates()[0].notes,'Reviewed in sidebar');
  db.editCandidate('https://linkedin.com/in/alpha',{status:'shortlisted'});
  db.upsertCandidates([item('alpha',{status:'new',notes:'Old notes'})]);
  assert.equal(db.allCandidates()[0].status,'shortlisted');assert.equal(db.allCandidates()[0].notes,'Reviewed in sidebar');
});
test('stage notes editable and invalid stage rejected',t=>{
  const db=createStore(temporary(t));t.after(()=>db.close());db.upsertCandidates([item('alpha')]);
  assert.equal(db.editCandidate('https://linkedin.com/in/alpha',{status:'contacted',notes:'Follow up'}).status,'contacted');
  assert.throws(()=>db.editCandidate('https://linkedin.com/in/alpha',{status:'hired'}),/Invalid stage/);
});
test('only source-backed verified establishments import',t=>{
  const db=createStore(temporary(t));t.after(()=>db.close());
  const result=db.upsertEstablishments([{id:'one',name:'Depot',address:'France',lat:48,lon:2,verified:true,sourceUrl:'https://example.org'},
    {id:'two',name:'Unknown',address:'France',lat:46,lon:3,verified:false,sourceUrl:'https://example.org'}]);
  assert.equal(result.added,1);assert.equal(result.skipped,1);
});
test('Chrome pairing token stored hashed, not raw',t=>{
  const dir=temporary(t),db=createStore(dir);t.after(()=>db.close());const token='a'.repeat(64);
  db.registerToken(token,'Chrome 2');assert.equal(db.verifyToken(token),true);assert.equal(db.verifyToken('b'.repeat(64)),false);
  const bytes=fs.readFileSync(path.join(dir,'fleetbridge.sqlite'));assert.equal(bytes.includes(Buffer.from(token)),false);
});
test('Atlas prospect stages and notes are shared across browser profiles and restarts',t=>{
  const dir=temporary(t),db=createStore(dir);
  db.updateAtlasProspect('ratp-example',{status:'Contacted',notes:'Send message next week'});
  db.close();
  const reopened=createStore(dir);t.after(()=>reopened.close());
  assert.equal(reopened.atlasProspects().statuses['ratp-example'],'Contacted');
  assert.equal(reopened.atlasProspects().notes['ratp-example'],'Send message next week');
  assert.equal(reopened.updateAtlasProspect('ratp-example',{status:'In discussion'}).notes,'Send message next week');
});
test('Atlas CSV custom thumbtacks survive restart; invalid positions are rejected',t=>{
  const dir=temporary(t),db=createStore(dir);
  const custom={id:'custom-abc123',name:'Bus Depot',city:'Lille',code:'FR',lat:50.63,lng:3.06,type:'depot',origin:'manual'};
  assert.equal(db.upsertAtlasCustom([custom]).added,1);
  assert.throws(()=>db.upsertAtlasCustom([{...custom,id:'custom-invalid',lat:135}]),/Invalid manual Atlas pin/);
  db.close();const reopened=createStore(dir);t.after(()=>reopened.close());
  assert.equal(reopened.allAtlasCustom().length,1);
  assert.equal(reopened.allAtlasCustom()[0].city,'Lille');
});
