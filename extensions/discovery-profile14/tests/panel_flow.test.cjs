const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const FB=require('../core.js');

test('minimal capture sidebar stages profile and full history without modifying approved review',async()=>{
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',disabled:false,events:{},
      classList:{toggle(){}},addEventListener(type,fn){this.events[type]=fn;}});
    return elements.get(id);
  };
  const base=FB.newRecord('https://linkedin.com/in/technician','Technician','From Google');
  base.notes='Original notes';base.profileImport={name:'Reviewed Name',headline:'Approved headline',importedAt:'2026-11-01T09:00:00Z'};
  let saved=base,full=false,opened=false;
  const storage={fleetbridgeReviewQueueV1:{urls:[base.url],index:0}};
  const responses=[
    {ok:true,url:base.url,fields:{name:'Candidate Name',headline:'Technicien mécanique',location:'Paris, France',experience:'Mécanicien\nKeolis\n2020 - 2024'},confidence:'high'},
    {ok:true,url:base.url+'/details/experience/',experienceText:'Mécanicien\nKeolis\n2020 - 2024\nParis, France\nTechnicien bus\nRATP\n2025 - aujourd’hui\nLille, France'}
  ];
  const context={FB,FBDB:{all:async()=>[saved],save:async row=>{saved=row;}},
    fleetbridgeExtractVisibleProfile(){},fleetbridgeExtractFullExperience(){},
    document:{getElementById:element},console,Date,
    chrome:{
      storage:{local:{get:async key=>({[key]:storage[key]}),set:async changes=>Object.assign(storage,changes)}},
      permissions:{request:async()=>true},
      tabs:{query:async()=>[{id:42,url:full?base.url+'/details/experience/':base.url}]},
      scripting:{executeScript:async()=>[{result:responses.shift()}]},
      runtime:{openOptionsPage:async()=>{opened=true;}}
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../panel.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
  await tick();
  assert.match(element('progress').textContent,/1 \/ 1/);
  element('capture').events.click();await tick();
  assert.equal(saved.profileImport.name,'Reviewed Name');
  assert.equal(saved.notes,'Original notes');
  assert.equal(saved.profileCapture.fields.name,'Candidate Name');
  assert.equal(saved.profileCapture.roles.length,1);
  assert.match(element('result').textContent,/ready for review/);
  full=true;
  element('captureFull').events.click();await tick();
  assert.equal(saved.profileImport.headline,'Approved headline');
  assert.equal(saved.profileCapture.roles.length,2);
  assert.equal(saved.profileCapture.fullExperienceCaptured,true);
  assert.equal(elements.has('field-name'),false,'no input/editor in capture sidebar');
  element('review').events.click();await tick();
  assert.equal(opened,true);
  assert.equal(storage.fleetbridgeDashboardSelectionV1,base.url);
});
