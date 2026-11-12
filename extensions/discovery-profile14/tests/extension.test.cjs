const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('Manifest V3 only requests LinkedIn origin on demand, with side panel and local database',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
  assert.equal(manifest.manifest_version,3);
  assert.equal(manifest.side_panel.default_path,'panel.html');
  assert.equal(manifest.background.service_worker,'background.js');
  assert.ok(manifest.optional_host_permissions.includes('https://*.linkedin.com/*'));
  assert.ok(!manifest.host_permissions.some(x=>x.includes('linkedin.com')));
  assert.match(fs.readFileSync(path.join(root,'db.js'),'utf8'),/DB_NAME='fleetbridge-search-collector'/);
  assert.match(fs.readFileSync(path.join(root,'background.js'),'utf8'),/importScripts\('experience_metrics\.js','core\.js'/);
  for(const file of [manifest.side_panel.default_path,manifest.options_page,manifest.action.default_popup,
    manifest.background.service_worker,'core.js','experience_metrics.js','db.js','profile_capture.js','google_capture.js','panel.js','dashboard.js','review_workspace.js','popup.js'])
    assert.ok(fs.existsSync(path.join(root,file)),`${file} missing`);
});
test('the extension only stages user-click captures; review and save controls are in workspace',()=>{
  const panel=fs.readFileSync(path.join(root,'panel.js'),'utf8');
  const workspace=fs.readFileSync(path.join(root,'review_workspace.js'),'utf8');
  assert.match(panel,/\$\('capture'\)\.addEventListener\('click'/);
  assert.match(panel,/\$\('captureFull'\)\.addEventListener\('click'/);
  assert.match(panel,/FB\.stageCapture\(/);
  assert.doesNotMatch(panel,/FB\.mergeReview\(/);
  assert.match(workspace,/\$\('saveReview'\)\.addEventListener\('click'/);
  assert.match(workspace,/FB\.mergeReview\(/);
  const panelMarkup=fs.readFileSync(path.join(root,'panel.html'),'utf8');
  assert.doesNotMatch(panelMarkup,/<textarea|<select/i,'capture sidebar should contain no review form inputs');
  assert.match(fs.readFileSync(path.join(root,'dashboard.html'),'utf8'),/id="saveReview"/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'background.js'),'utf8'),/linkedin\.com/);
});
