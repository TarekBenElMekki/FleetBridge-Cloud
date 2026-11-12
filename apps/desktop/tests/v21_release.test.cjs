'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os');
const ROOT=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(ROOT,'public','index.html'),'utf8');
const ui=fs.readFileSync(path.join(ROOT,'public','app.js'),'utf8');
const atlas=fs.readFileSync(path.join(ROOT,'public','atlas','app.js'),'utf8');
const readJSON=p=>JSON.parse(fs.readFileSync(path.join(ROOT,'public','atlas',p),'utf8'));
test('three required navigation destinations and no pairing page',()=>{
  for(const route of ['crm','companies','map'])assert.match(html,new RegExp(`data-view="${route}"`));
  assert.doesNotMatch(html,/data-view="settings"|id="pair-code"|Settings &amp; pairing/);
  assert.match(ui,/companies: 'companies'/);assert.match(ui,/map: 'map'/);
});
test('company table fuses original Atlas and sourced truck records',()=>{
  const atlas=readJSON('data.json'),heavy=readJSON('heavy-vehicles.json');
  assert.equal(atlas.operators.length,418);assert.equal(heavy.records.length,8);
  for(const o of heavy.records){assert.equal(o.code,'FR');assert.ok(o.source.startsWith('https://'));assert.ok(Number.isFinite(o.lat));assert.ok(Number.isFinite(o.lng));}
  assert.match(ui,/loadCompanyDirectory/);assert.match(ui,/atlasRecords/);
});
test('French divisions from existing extension are included and toggleable',()=>{
  const regs=readJSON('france-regions.json'),deps=readJSON('france-departments.json');
  assert.ok(regs.features.length>=13);assert.ok(deps.features.length>=95);
  assert.match(atlas,/loadFrenchBoundaries/);assert.match(atlas,/geoBreadcrumb/);
});
test('historical location, nearest operator and radar do not invent unknown values',()=>{
  assert.match(html,/Age ≤55/);assert.match(html,/Experience 5\+/);assert.match(html,/candidate-history-map/);
  const code=fs.readFileSync(path.join(ROOT,'public','v21-intelligence.js'),'utf8');
  const sandbox={globalThis:{}};vm.runInNewContext(code,sandbox);const fn=sandbox.globalThis.FBV21;
  assert.equal(fn.age({}),null);assert.equal(fn.experience({}),null);
  assert.equal(fn.age({profileImport:{age:45}}),45);
  assert.equal(fn.experience({profileImport:{experienceRoles:[{startDate:'2018-01',endDate:'2020-12'},{startDate:'2019-01',endDate:'2023-12'}]}}),6);
});
test('login assets and server-side PIN gate exist',()=>{
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
  assert.match(server,/gate\.authorized\(req\)/);assert.match(server,/\/api\/auth\/login/);
  assert.match(server,/res\.writeHead\(302/);
  const login=fs.readFileSync(path.join(ROOT,'public','login.html'),'utf8');assert.match(login,/type="password"/);
});
