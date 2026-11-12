const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const FB=require('../core.js'),FBCareer=require('../career_intelligence.js');

function workspaceHarness(record){
  const elements=new Map();
  function createElement(tag='div'){
    return {tagName:tag.toUpperCase(),value:'',textContent:'',disabled:false,children:[],events:{},
      classList:{toggle(){}},append(...parts){this.children.push(...parts);},
      replaceChildren(){this.children=[];},querySelector(){return {value:''};},
      addEventListener(kind,callback){this.events[kind]=callback;}};
  }
  const find=id=>{
    if(!elements.has(id))elements.set(id,{...createElement('div'),id});
    return elements.get(id);
  };
  let saved=null;
  const context={FB,FBCareer,FBGeo:{resolveLocation:async loc=>({geo:loc.includes('Paris')?{
    city:'Paris',countryCode:'FR',region:'Île-de-France',regionCode:'11',lat:48.85,lon:2.35}:null})},
    document:{getElementById:find,createElement},console,Date,confirm:()=>true,
    chrome:{storage:{local:{get:async()=>({}),set:async()=>{}}}},
    reload:async()=>{},render:()=>{},FBDB:{save:async row=>{saved=row;}}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../review_workspace.js'),'utf8'),context);
  context.FBWorkspace.reconcile([record]);
  return {context,find,get saved(){return saved;}};
}

test('workspace consumes a staged capture only after an explicit human Save',async()=>{
  const base=FB.newRecord('https://linkedin.com/in/test-saved','Candidate','Google snippet');
  base.notes='Keep notes';
  const staged=FB.stageCapture(base,base.url,{fields:{name:'Jean Exemple',headline:'Technicien',experience:'Technicien\nRATP\n2020 - 2025\nParis, France'}},'profile');
  const h=workspaceHarness(staged);
  assert.equal(h.saved,null,'selecting and rendering never writes to DB');
  assert.match(h.find('reviewTitle').textContent,/Jean Exemple/);
  assert.match(h.find('responseEmployer').textContent,/RATP/);
  h.find('reviewName').value='Jean Exemple (verified)';h.find('reviewName').events.input();
  h.find('saveReview').events.click();
  await new Promise(r=>setTimeout(r,25));
  assert.equal(h.saved.profileImport.name,'Jean Exemple (verified)');
  assert.equal(h.saved.profileCapture,null);
  assert.equal(h.saved.notes,'Keep notes');
  assert.equal(h.saved.profileImport.experienceRoles.length,1);
});

test('new capture does not silently replace previously approved professional details',async()=>{
  const base=FB.newRecord('https://linkedin.com/in/someone');
  base.profileImport={name:'Approved Name',headline:'Verified Headline',experience:'',importedAt:'2026-10-01T00:00:00Z'};
  const staged=FB.stageCapture(base,base.url,{fields:{name:'New Unverified Name',headline:'Different title',experience:'Technicien\nKeolis\n2021 - 2026'}},'profile');
  const h=workspaceHarness(staged);
  assert.equal(h.find('reviewName').value,'Approved Name');
  h.find('applyCapture').events.click();
  assert.equal(h.find('reviewName').value,'New Unverified Name');
  assert.equal(h.saved,null,'explicit capture application is still only a draft');
});
