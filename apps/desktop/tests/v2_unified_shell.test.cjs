'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'../public');const read=p=>fs.readFileSync(path.join(base,p),'utf8');
test('V2.1 has exactly three FleetBridge global destinations',()=>{
 const html=read('index.html');
 for(const v of ['crm','companies','map'])assert.match(html,new RegExp(`data-view="${v}"`));
 assert.doesNotMatch(html,/data-view="settings"|id="pair-code"/);assert.match(html,/sidebar-toggle/);
 assert.match(html,/atlas-frame.*embedded=1/);
});
test('V2.1 keeps browser history and selection while routing in one shell',()=>{
 const js=read('app.js');assert.match(js,/history\.pushState/);assert.match(js,/addEventListener\('popstate'/);assert.match(js,/addEventListener\('hashchange'/);
 assert.match(js,/FLEETBRIDGE_OPEN_CANDIDATE/);assert.match(js,/FLEETBRIDGE_SELECT_EMPLOYER/);
});
test('V2.2 is institutional light-only across shell and map',()=>{
 const js=read('app.js');assert.match(js,/FLEETBRIDGE_PRESENTATION/);
 assert.doesNotMatch(read('index.html'),/id="theme-toggle"/);
 assert.match(read('theme-init.js'),/dataset.theme = 'light'/);
 assert.match(read('atlas/embed-init.js'),/dataset.theme = 'light'/);
 assert.doesNotMatch(read('atlas/v2.css'),/html\[data-theme="dark"\]/);
 assert.doesNotMatch(read('v2.css'),/html\[data-theme="dark"\]/);
 assert.match(read('v22.css'),/institutional-light/);
});
test('Atlas is embedded and preserves filter-map-inspector without a second navigation',()=>{
 const css=read('atlas/v2.css');assert.match(css,/html\.embedded \.rail,html\.embedded \.topbar,html\.embedded \.main-footer \{ display: none !important;/);
 assert.match(css,/grid-template-columns: minmax\(205px,238px\) minmax\(0,1fr\) minmax\(225px,280px\)/);
 assert.doesNotMatch(read('app.js'),/fleetbridge-parent-embedded-style/);
});
test('V2.1 still uses original persisted store APIs without a pairing page',()=>{
 assert.ok(fs.statSync(path.join(base,'../store.js')).isFile());assert.ok(fs.statSync(path.join(base,'../server.js')).isFile());
 assert.match(read('index.html'),/id="save-edit"/);assert.match(read('index.html'),/id="json-file"/);
 assert.doesNotMatch(read('index.html'),/id="pair-code"/);
});
