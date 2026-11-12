'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..','public',p),'utf8');
test('compact neutral CRM loads its final stylesheet',()=>{
  const html=read('index.html'),css=read('v23.css');
  assert.ok(html.indexOf('/v23.css')>html.indexOf('/v22.css'));
  assert.match(css,/max-width:1270px/);
  assert.match(css,/height:43px/);
  assert.match(css,/\.refresh-button/);
  assert.doesNotMatch(html,/Workspace connected/);
});
test('filters appear inside the first header row in all three tables',()=>{
  const html=read('index.html');
  for (const id of ['search','stage-filter','location-filter','source-filter','company-search','company-sector','company-country','company-group','company-origin']){
    assert.match(html,new RegExp(`<(?:(?:input)|(?:select))[^>]*id="${id}"`));
  }
  assert.equal((html.match(/class="filter-header"/g)||[]).length,3);
  assert.equal((html.match(/id="search"/g)||[]).length,1);
  assert.equal((html.match(/id="company-search"/g)||[]).length,1);
});
test('client-side filters preserve source, group and provenance checks',()=>{
 const js=read('app.js');
 for(const v of ['source-filter','company-group','company-origin','clear-company-filters']) assert.match(js,new RegExp(v));
 assert.match(js,/if \(candidateSource !== 'all'/);
 assert.match(js,/originCategory\(o\)/);
});
test('login layout remains protected by existing server PIN authentication',()=>{
 assert.match(read('login.html'),/id="pin"/);
 assert.match(read('login.html'),/href="\/login.css"/);
 assert.doesNotMatch(read('login.html'),/login-v23.css/);
 const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
 assert.match(server,/gate\.authorized\(req\)/);
});
