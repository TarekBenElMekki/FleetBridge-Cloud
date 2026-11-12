'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../public/atlas');
const read=p=>fs.readFileSync(path.join(dir,p),'utf8');
test('original operator Atlas is bundled with exact dataset, map libraries and logos',()=>{
  const data=JSON.parse(read('data.json'));
  assert.equal(data.operators.length,418);
  assert.equal(data.summary.countries,38);
  assert.ok(data.operators.some(o=>o.type==='hq'));
  const manifest=JSON.parse(read('logo-manifest.json'));
  assert.ok(Object.keys(manifest.groups).length>10);
  for(const asset of ['assets/leaflet.js','assets/leaflet.css','assets/leaflet.markercluster.js','assets/MarkerCluster.css','europe-base.geojson','map-base.css','brand-fullscreen.css']){
    assert.ok(fs.statSync(path.join(dir,asset)).size>100,asset);
  }
});
test('full-screen Atlas contains separate company and candidate pin layers and CRM navigation',()=>{
  const index=read('index.html'),app=read('app.js'),shell=fs.readFileSync(path.join(dir,'../index.html'),'utf8');
  assert.match(index,/id="goCRM"/);
  assert.match(index,/candidate-locations\.js/);
  assert.match(index,/id="showCandidates"[^>]*checked/);
  assert.match(app,/candidateLayer=L\.markerClusterGroup/);
  assert.match(app,/loadDesktopCandidates/);
  assert.match(app,/FLEETBRIDGE_OPEN_CANDIDATE/);
  assert.match(shell,/id="atlas-frame"/);
});
