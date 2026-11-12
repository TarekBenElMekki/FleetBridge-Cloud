'use strict';
const http=require('node:http'),path=require('node:path'),fs=require('node:fs');
const root=path.join(__dirname,'public');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.txt':'text/plain'};
const port=Number(process.env.PORT||18760);
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'),name=u.pathname;
  if(name==='/login'){res.writeHead(302,{location:'/'});res.end();return;}
  if(name.startsWith('/api/')){
    const route=name.replace(/^\/api\//,'');
    if(!/^[a-z\-/]+$/.test(route)) {res.writeHead(404);res.end();return;}
    const file=path.join(__dirname,'api',route+'.js');
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    return require(file)(req,res);
  }
  const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));
  if(!target.startsWith(root+path.sep)||!fs.existsSync(target)||!fs.statSync(target).isFile()){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  fs.createReadStream(target).pipe(res);
});
if(require.main===module) server.listen(port,'127.0.0.1',()=>console.log('FleetBridge synthetic web preview: http://127.0.0.1:'+port));
module.exports=server;
