'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const p=path.join(__dirname,'../public');const load=path=>fs.readFileSync(require('node:path').join(p,path),'utf8');
test('institutional login stays a real PIN form',()=>{
 const html=load('login.html'),css=load('login.css');assert.match(html,/id="loginForm"/);assert.match(html,/id="pin"/);assert.match(html,/type="password"/);assert.match(html,/>Sign in<\/h1>/);assert.doesNotMatch(html,/Recruitment operations/);assert.doesNotMatch(css,/radial-gradient|linear-gradient|\.atmosphere/);assert.match(css,/border-radius:2px/);
});
test('four routes, no dark mode UI or pairing page',()=>{
 const html=load('index.html');assert.deepEqual([...html.matchAll(/data-view="([a-z]+)"/g)].map(x=>x[1]),['crm','companies','contracts','map']);assert.doesNotMatch(html,/id="theme-toggle"|id="pair-code"/);assert.match(html,/id="logout"/);
});
test('source-backed company, Atlas and candidates unchanged',()=>{
 assert.equal(JSON.parse(load('atlas/data.json')).operators.length,418);assert.equal(JSON.parse(load('atlas/heavy-vehicles.json')).records.length,8);assert.match(load('app.js'),/loadCompanyDirectory/);assert.match(load('atlas/index.html'),/showRegions/);assert.match(load('atlas/index.html'),/showDepartments/);
});
test('flat CRM table accents and map styles are loaded last',()=>{
 const html=load('index.html'),atlas=load('atlas/index.html');assert.ok(html.indexOf('/v22.css')>html.indexOf('/v21.css'));assert.ok(atlas.indexOf('v22.css')>atlas.indexOf('v21.css'));const css=load('v22.css');assert.match(css,/\.candidate-row\.is-selected/);assert.match(css,/\.directory-panel tbody tr/);assert.match(css,/\.stage\[data-stage="shortlisted"\]/);
});
