'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const gateway=require('../api/gateway');
const config=require('../vercel.json');
function call(route,method='GET',variant='original') {
 return new Promise((resolve,reject)=>{
   const headers={};
   const req={method,url:variant==='rewritten'? '/api/gateway?route='+encodeURIComponent(route) : '/api/'+route,query:variant==='rewritten'?{route}:undefined};
   const res={statusCode:200,setHeader(k,v){headers[k]=v;},end(body){try{resolve({status:this.statusCode,body:JSON.parse(body),headers});}catch(e){reject(e)}}};
   try{gateway(req,res);}catch(e){reject(e)}
 });
}
test('Hobby plan: exactly one Vercel Serverless Function',()=>{
 const files=fs.readdirSync(path.join(root,'api'),{withFileTypes:true}).filter(x=>x.isFile()&&x.name.endsWith('.js'));
 assert.deepEqual(files.map(x=>x.name),['gateway.js']);
 assert.equal(fs.readdirSync(path.join(root,'api'),{withFileTypes:true}).filter(x=>x.isDirectory()).length,0);
});
test('all original endpoint URLs rewrite to the single gateway',()=>{
 const expected=['atlas-custom','atlas-prospect','atlas-prospects','auth/login','auth/logout','auth/status','candidate','candidates','contracts','establishments','export','health','import','pair-code','pair','sync'];
 const actual=config.rewrites.map(x=>x.source.replace('/api/',''));
 assert.deepEqual(actual.slice().sort(),expected.slice().sort());
 for(const r of config.rewrites)assert.equal(r.destination,'/api/gateway?route='+r.source.slice(5));
});
test('GET preserved for all read APIs',async()=>{
 for(const route of ['atlas-custom','atlas-prospects','auth/status','candidates','contracts','establishments','health']) {
   const a=await call(route,'GET','original');
   const b=await call(route,'GET','rewritten');
   assert.equal(a.status,200,route);
   assert.deepEqual(a.body,b.body,route);
 }
});
test('write methods stay blocked; login cannot authenticate',async()=>{
 for(const route of ['candidates','contracts','health','atlas-prospects','sync','pair','pair-code','import','candidate','atlas-prospect','export','auth/logout']) {
   assert.equal((await call(route,'POST','rewritten')).status,405,route);
 }
 assert.equal((await call('auth/login','POST','rewritten')).status,403);
 assert.equal((await call('auth/status','POST','rewritten')).status,405);
});
test('unrecognized URL returns 404',async()=>{
 assert.equal((await call('totally-unknown')).status,404);
});
test('standalone dev server preserves public URLs',async(t)=>{
 const server=require('../dev-server');
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const checks=[['/api/health',200],['/api/candidates',200],['/api/contracts',200],['/api/auth/status',200],['/api/sync',405],['/',200]];
 for(const [name,expected] of checks){
   const r=await fetch(base+name);
   assert.equal(r.status,expected,name);
 }
});
