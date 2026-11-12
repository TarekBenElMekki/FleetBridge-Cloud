const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const FB=require('../core.js');

test('multiple manual captures preserve corrected fields and accumulate newly visible sections',async()=>{
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{
      id,value:'',textContent:'',disabled:false,
      classList:{toggle(){},remove(){}},
      events:{},addEventListener(type,fn){this.events[type]=fn;},
      replaceChildren(){this.children=[];},append(...items){
        this.children.push(...items);
        for(const item of items)if(item.id)elements.set(item.id,item);
      },children:[]
    });
    return elements.get(id);
  }
  const row={...FB.newRecord('https://linkedin.com/in/technician','Technician','From Google','query'),notes:'original recruiter notes'};
  const storage={};
  const captures=[
    {ok:true,url:row.url,fields:{name:'Jean Dupont',headline:'Mécanicien',experience:''},
      sections:[],confidence:'low',problems:[],diagnostics:{nameSource:'browser title',visibleHeadings:1,anchorsFound:0,cardsExamined:0}},
    {ok:true,url:row.url,fields:{name:'Jean Inexact',headline:'',experience:'Technicien bus\nRATP\n2017 - 2026'},
      sections:['experience'],confidence:'low',problems:[],diagnostics:{nameSource:'browser title',visibleHeadings:2,anchorsFound:1,cardsExamined:1}}
  ];
  let saved=null,confirmCount=0;
  const context={
    document:{getElementById:element,createElement:type=>({type,id:'',value:'',textContent:'',events:{},addEventListener(kind,cb){this.events[kind]=cb;}})},
    FB,FBDB:{all:async()=>[saved||row],save:async next=>{saved=next;}},
    fleetbridgeExtractVisibleProfile:()=>{},
    chrome:{
      storage:{local:{get:async key=>({[key]:storage[key]}),set:async changes=>Object.assign(storage,changes)}},
      permissions:{request:async()=>true},
      tabs:{query:async()=>[{id:40,url:row.url}]},
      scripting:{executeScript:async()=>[{result:captures.shift()}]},
      runtime:{openOptionsPage(){}}
    },
    setInterval(){return 42;},clearInterval(){},Date,console,
    confirm:()=>{confirmCount++;return true;}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../panel.js'),'utf8'),context);
  const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
  await settle();
  assert.equal(element('progress').textContent.includes('Candidate 1 of 1'),true);

  element('capture').events.click();await settle();
  assert.equal(elements.has('field-about'),false);
  assert.equal(element('field-experience').value,'');
  element('field-name').value='Jean Dupont (verified)';
  element('field-name').events.input();

  element('capture').events.click();await settle();
  assert.equal(element('field-name').value,'Jean Dupont (verified)');
  assert.match(element('field-experience').value,/RATP/);
  assert.match(element('confidence').textContent,/Experience detected/);
  assert.match(element('totalWork').textContent,/years/);
  assert.equal(element('latestCompany').textContent,'RATP');
  element('save').events.click();await settle();
  assert.equal(saved.notes,'original recruiter notes');
  assert.equal(saved.profileImport.name,'Jean Dupont (verified)');
  assert.match(saved.profileImport.experience,/2017 - 2026/);
  assert.ok(saved.profileImport.experienceSummary.totalYears>0);
  assert.equal(confirmCount,0,'a named candidate with an experience section should not be low confidence');
});
