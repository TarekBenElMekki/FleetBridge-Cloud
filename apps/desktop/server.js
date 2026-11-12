'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createStore}=require('./store');
const {createAuthGate}=require('./auth-gate');
const PORT=17842,HOST='127.0.0.1',LOCAL=`http://${HOST}:${PORT}`;
function makeServer({port=PORT,store=createStore(),pinAuth=false,pin='1234'}={}){
  const gate=pinAuth?createAuthGate(pin):null;
  let pair={code:'',until:0},failedPairs=[];
  const code=()=>{if(Date.now()>pair.until){pair={code:String(crypto.randomInt(0,1000000)).padStart(6,'0'),until:Date.now()+5*60*1000};}return pair;};
  const extensions=/^chrome-extension:\/\/[a-p]{32}$/;
  const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
  const respond=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
  const getBody=(req,limit=10*1024*1024)=>new Promise((resolve,reject)=>{let size=0,chunks=[];
    req.on('data',chunk=>{size+=chunk.length;if(size>limit){reject(Object.assign(Error('Request too large.'),{httpStatus:413}));req.destroy();}else chunks.push(chunk);});
    req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('Invalid JSON payload.'));}});req.on('error',reject);
  });
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    // The authored Atlas uses inline per-company colors for logo/thumbtack pins.
    // Keep scripts self-hosted while permitting these computed inline styles.
    res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' https://tile.openstreetmap.org data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://geo.api.gouv.fr; object-src 'none'; base-uri 'none'");
    const origin=req.headers.origin||'';const extension=extensions.test(origin);
    const boundPort=server.address()?.port??port;
    const sameOrigin=origin===`http://${HOST}:${boundPort}`;
    if(extension){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');}
    if(req.method==='OPTIONS'){res.writeHead(extension?204:403);res.end();return;}
    const url=new URL(req.url||'/',LOCAL),p=url.pathname;
    try{
      if (gate) {
        if (p==='/api/auth/login' && req.method==='POST') {
          if (origin && !sameOrigin) return respond(res,403,{error:'Origin not authorized.'});
          const body=await getBody(req,1000);
          const result=gate.login(req,body?.pin);
          if (!result.ok) return respond(res,result.code,{error:result.error,remaining:result.remaining});
          res.setHeader('Set-Cookie',result.cookie);
          return respond(res,200,{ok:true});
        }
        if (p==='/api/auth/status' && req.method==='GET')
          return respond(res,200,{authenticated:gate.authorized(req)});
        const publicAssets=new Set(['/login','/login.html','/login.css','/login.js','/favicon.ico','/fleetbridge-brand.png']);
        if (!gate.authorized(req) && !publicAssets.has(p)) {
          if (p.startsWith('/api/')) return respond(res,401,{error:'Sign in to access FleetBridge.'});
          res.writeHead(302,{'Location':'/login','Cache-Control':'no-store'});res.end();return;
        }
        if (p==='/api/auth/logout' && req.method==='POST') {
          if (origin && !sameOrigin) return respond(res,403,{error:'Origin not authorized.'});
          res.setHeader('Set-Cookie',gate.logout(req));return respond(res,200,{ok:true});
        }
      }
      if(p==='/api/health'&&req.method==='GET')return respond(res,200,{ok:true,app:'FleetBridge Desktop',version:pinAuth?'2.4.0':'0.3.0'});
      if(p==='/api/pair'&&req.method==='POST'){
        if(!extension)return respond(res,403,{error:'Pairing is only available to Chrome extensions.'});
        failedPairs=failedPairs.filter(t=>Date.now()-t<10*60*1000);
        if(failedPairs.length>=10)return respond(res,429,{error:'Too many attempts. Try again in ten minutes.'});
        const request=await getBody(req,2000);
        if(!pair.code||Date.now()>pair.until||request?.code!==pair.code){failedPairs.push(Date.now());return respond(res,403,{error:'Invalid or expired pairing code.'});}
        pair={code:'',until:0};const token=crypto.randomBytes(32).toString('hex');store.registerToken(token,request.label);
        return respond(res,200,{ok:true,token});
      }
      if(p==='/api/sync'&&req.method==='POST'){
        if(!extension)return respond(res,403,{error:'Chrome extension origin required.'});
        const token=String(req.headers.authorization||'').replace(/^Bearer /i,'');
        if(!store.verifyToken(token))return respond(res,401,{error:'Profile not paired or token invalid.'});
        const body=await getBody(req);return respond(res,200,{ok:true,...store.upsertCandidates(body.records)});
      }
      // Desktop browser APIs accept only the dedicated same-origin app, not other websites.
      if(p.startsWith('/api/')&&origin&&!sameOrigin)return respond(res,403,{error:'Origin not authorized.'});
      if(p==='/api/pair-code'&&req.method==='GET'){const pairCode=code();return respond(res,200,{code:pairCode.code,expiresAt:pairCode.until,clients:store.clients()});}
      if(p==='/api/candidates'&&req.method==='GET')return respond(res,200,{records:store.allCandidates()});
      if(p==='/api/establishments'&&req.method==='GET')return respond(res,200,{records:store.allEstablishments()});
      if(p==='/api/contracts'&&req.method==='GET')return respond(res,200,{records:store.allContracts()});
      if(p==='/api/contracts'&&req.method==='POST'){
        const payload=await getBody(req,20000);return respond(res,200,{ok:true,contract:store.saveContract(payload)});
      }
      if(p==='/api/atlas-prospects'&&req.method==='GET')return respond(res,200,store.atlasProspects());
      if(p==='/api/atlas-prospect'&&req.method==='POST'){
        const {id,updates}=await getBody(req,25000);return respond(res,200,{ok:true,prospect:store.updateAtlasProspect(id,updates)});
      }
      if(p==='/api/atlas-custom'&&req.method==='GET')return respond(res,200,{records:store.allAtlasCustom()});
      if(p==='/api/atlas-custom'&&req.method==='POST'){
        const body=await getBody(req,2*1024*1024);return respond(res,200,{ok:true,...store.upsertAtlasCustom(body.records)});
      }
      if(p==='/api/export'&&req.method==='GET')return respond(res,200,{format:'fleetbridge-desktop-backup',version:3,exportedAt:new Date().toISOString(),records:store.allCandidates(),establishments:store.allEstablishments(),atlasProspects:store.atlasProspects(),atlasCustom:store.allAtlasCustom(),contracts:store.allContracts()});
      if(p==='/api/import'&&req.method==='POST'){
        const payload=await getBody(req,80*1024*1024);
        // Old Chrome backups may be a bare array or {profiles:[...]}.
        const candidates=Array.isArray(payload)?payload:payload?.records||payload?.profiles||payload?.candidates||payload?.rows;
        if(!Array.isArray(candidates)&&!Array.isArray(payload?.contracts))throw Error('No candidate or contract records found in backup.');
        const result=Array.isArray(candidates)?store.upsertCandidates(candidates):{added:0,updated:0,skipped:0};
        if(Array.isArray(payload?.contracts))result.contracts=store.importContracts(payload.contracts);
        if(Array.isArray(payload.establishments))result.establishments=store.upsertEstablishments(payload.establishments);
        if(Array.isArray(payload.atlasCustom))result.atlasCustom=store.upsertAtlasCustom(payload.atlasCustom);
        if(payload.atlasProspects&&typeof payload.atlasProspects==='object'){
          for(const [id,status] of Object.entries(payload.atlasProspects.statuses||{})){
            result.atlasProspects=(result.atlasProspects||0)+1;
            store.updateAtlasProspect(id,{status,notes:payload.atlasProspects.notes?.[id]||''});
          }
        }
        return respond(res,200,{ok:true,...result});
      }
      if(p==='/api/candidate'&&req.method==='POST'){
        const {url,updates}=await getBody(req,20000);
        return respond(res,200,{ok:true,candidate:store.editCandidate(url,updates)});
      }
      if(p==='/api/establishments'&&req.method==='POST'){
        const body=await getBody(req,10*1024*1024);
        return respond(res,200,{ok:true,...store.upsertEstablishments(body.records)});
      }
      if(req.method!=='GET')return respond(res,405,{error:'Method not allowed.'});
      const file=p==='/'?'index.html':p==='/login'?'login.html':p.slice(1),root=path.join(__dirname,'public');
      const resolved=path.resolve(root,file);
      if(!resolved.startsWith(root+path.sep)||!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())return respond(res,404,{error:'Not found.'});
      res.writeHead(200,{'Content-Type':mime[path.extname(resolved)]||'application/octet-stream','Cache-Control':'no-store'});
      fs.createReadStream(resolved).pipe(res);
    }catch(error){if(!res.headersSent)return respond(res,error.httpStatus||400,{error:error.message||'Request failed.'});}
  });
  return {server,store,listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,HOST,()=>{server.off('error',reject);resolve(server.address());});}),close:()=>new Promise(resolve=>server.close(()=>{store.close();resolve();}))};
}
if(require.main===module){const app=makeServer();app.listen().then(()=>console.log(`FleetBridge Desktop at http://${HOST}:${PORT}`)).catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={makeServer};
