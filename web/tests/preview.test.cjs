'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),lib=require('../lib/demo');
const gateway=require('../api/gateway');
const route=(name)=>(req,res)=>gateway({...req,url:'/api/'+name,query:{route:name}},res);
function call(handler,method='GET'){
  return new Promise((resolve,reject)=>{
    const req={method},headers={};const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(body){try{resolve({status:this.statusCode,body:JSON.parse(body),headers});}catch(e){reject(e);}}};
    try{handler(req,res);}catch(e){reject(e);}
  });
}
test('demo fixtures are synthetic and do not contain candidate contact details',()=>{
 assert.equal(lib.candidates.length,5);
 assert.equal(lib.contracts.length,3);
 assert(lib.candidates.every(r=>r.notes.includes('SYNTHETIC')));
 assert(lib.contracts.every(r=>r.notes.includes('SYNTHETIC')));
 for(const row of lib.candidates)assert(!JSON.stringify(row).match(/@|\+\d{7}/));
});
test('GET and POST separated for candidates',async()=>{
 const candidatesRoute=route('candidates');
 const a=await call(candidatesRoute);assert.equal(a.status,200);assert.equal(a.body.records.length,5);
 const b=await call(candidatesRoute,'POST');assert.equal(b.status,405);assert.match(b.body.error,/read-only/);
});
test('contract save and extension sync are blocked',async()=>{
 assert.equal((await call(route('contracts'),'POST')).status,405);
 assert.equal((await call(route('sync'),'POST')).status,405);
 assert.equal((await call(route('auth/login'),'POST')).status,403);
});
test('no local authentication or SQLite shipped with web',()=>{
 for(const name of ['server.js','store.js','auth-gate.js','preview.js'])assert(!fs.existsSync(path.join(root,name)));
 assert(!fs.existsSync(path.join(root,'public','login.html')));
 const page=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 assert.match(page,/synthetic data · read only/);
});
test('static Atlas and 4 workspaces included',()=>{
 const page=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 for(const v of ['crm','companies','contracts','map'])assert(page.includes('data-view="'+v+'"'));
 assert(fs.existsSync(path.join(root,'public','atlas/data.json')));
});

test('auth endpoint never pretends the synthetic demo is a signed-in CRM',async()=>{const result=await call(route('auth/status'));assert.equal(result.body.authenticated,false);assert.equal(result.body.preview,true);});
