'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
test('V2.4 launcher opens normal default-browser tab, separate from live FleetBridge',()=>{
 const launcher=fs.readFileSync(path.join(root,'Start-FleetBridge-LocalPreview.ps1'),'utf8');
 assert.match(launcher,/Start-Process "\$baseUrl\/"/);
 assert.match(launcher,/18747/);
 assert.doesNotMatch(launcher,/--app=|msedge\.exe|Stop-Process|17842/);
});
test('light-only corporate presentation files remain linked',()=>{
 const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
 assert.match(html,/href="\/corporate\.css"/);assert.match(html,/href="\/v2\.css"/);assert.match(html,/href="\/v21\.css"/);assert.match(html,/href="\/v22\.css"/);
});
