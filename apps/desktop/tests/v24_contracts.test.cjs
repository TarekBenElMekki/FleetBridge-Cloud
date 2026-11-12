'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createStore}=require('../store');
const {makeServer}=require('../server');
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fbv24-contract-'));const db=createStore(dir);return {db,dir,cleanup(){db.close();fs.rmSync(dir,{recursive:true,force:true});}};}
const sample={candidateName:'Example Candidate',candidateUrl:'',role:'Mécanicien poids lourds',entity:'RS Univers Industrie',clientCompany:'Sample Depot',status:'active',contractType:'subcontracting',startDate:'2026-09-07',initialEndDate:'2026-11-07',renewal:'not_requested',renewalEndDate:'',hireDecision:'pending',notes:'Sample contract'};
test('contracts support manual candidates, initial trial, renewal and client decision',t=>{
 const x=fixture();t.after(()=>x.cleanup());
 const saved=x.db.saveContract(sample);assert.ok(/^[0-9a-f-]{36}$/.test(saved.id));assert.equal(x.db.allContracts().length,1);
 const updated=x.db.saveContract({...saved,renewal:'confirmed',renewalEndDate:'2027-01-07',hireDecision:'yes'});
 assert.equal(updated.id,saved.id);assert.equal(x.db.allContracts()[0].hireDecision,'yes');assert.equal(x.db.allContracts()[0].renewal,'confirmed');
 const imported=x.db.importContracts([{...updated,hireDecision:'no'}]);assert.equal(imported.imported,1);assert.equal(x.db.allContracts().length,1);assert.equal(x.db.allContracts()[0].hireDecision,'no');
});
test('contract date and entity validation disallows invented renewal and malformed dates',t=>{
 const x=fixture();t.after(()=>x.cleanup());
 assert.throws(()=>x.db.saveContract({...sample,initialEndDate:'2026-08-01'}),/first probation end/i);
 assert.throws(()=>x.db.saveContract({...sample,initialEndDate:'2026-02-30'}),/calendar date/i);
 assert.throws(()=>x.db.saveContract({...sample,entity:'Fake Holdings'}),/Unknown RS Univers/);
 assert.throws(()=>x.db.saveContract({...sample,renewal:'confirmed'}),/confirmed renewal/i);
 assert.throws(()=>x.db.saveContract({...sample,renewalEndDate:'2027-01-01'}),/Select confirmed renewal/i);
 assert.throws(()=>x.db.saveContract({...sample,hireDecision:'maybe'}),/Invalid contract status/i);
});
test('four pages and company-name column fixes are in final stylesheet',()=>{
 const root=path.join(__dirname,'../public');const html=fs.readFileSync(path.join(root,'index.html'),'utf8');const css=fs.readFileSync(path.join(root,'v24.css'),'utf8');
 assert.deepEqual([...html.matchAll(/data-view="([a-z]+)"/g)].map(x=>x[1]),['crm','companies','contracts','map']);
 assert.match(html,/id="org-branches"/);assert.match(html,/id="contract-rows"/);assert.match(html,/id="contract-form"/);
 assert.match(css,/display:table-cell!important/);assert.match(css,/td\.company-strong/);assert.match(html,/href="\/v24\.css"/);
});
test('contract endpoints remain protected by PIN, and export includes contracts',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fbv24-auth-'));
 const store=createStore(dir),app=makeServer({port:0,store,pinAuth:true,pin:'1234'});
 await app.listen();t.after(async()=>{await app.close();fs.rmSync(dir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${app.server.address().port}`;
 assert.equal((await fetch(base+'/api/contracts')).status,401);
 const forbidden=await fetch(base+'/api/contracts',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sample)});assert.equal(forbidden.status,401);
 const login=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:'1234'})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const save=await fetch(base+'/api/contracts',{method:'POST',headers:{'content-type':'application/json',cookie,origin:base},body:JSON.stringify(sample)});
 assert.equal(save.status,200,await save.text());
 const records=await fetch(base+'/api/contracts',{headers:{cookie}});assert.equal(records.status,200);
 assert.equal((await records.json()).records.length,1);
 const exported=await fetch(base+'/api/export',{headers:{cookie}});assert.equal((await exported.json()).contracts.length,1);
 const foreign=await fetch(base+'/api/contracts',{method:'POST',headers:{cookie,origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify(sample)});assert.equal(foreign.status,403);
});
