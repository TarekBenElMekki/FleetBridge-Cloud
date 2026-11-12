const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const FB=require('../core.js');

test('Save & Next keeps captured records, advances the pending queue and opens next profile',async()=>{
  const first=FB.newRecord('https://linkedin.com/in/mechanic-one','First',''),
    second=FB.newRecord('https://linkedin.com/in/mechanic-two','Second','');
  const saved=new Map([[first.url,first],[second.url,second]]),store={fleetbridgeReviewQueueV1:{urls:[first.url,second.url],index:0}};
  const elements=new Map(),opened=[];
  const element=id=>{
    if(!elements.has(id))elements.set(id,{value:'',textContent:'',disabled:false,events:{},
      classList:{toggle(){}},addEventListener(type,callback){this.events[type]=callback;}});
    return elements.get(id);
  };
  const context={FB,FBDB:{all:async()=>[...saved.values()],save:async row=>saved.set(row.url,row)},
    fleetbridgeExtractVisibleProfile(){},fleetbridgeExtractFullExperience(){},
    document:{getElementById:element},Date,console,
    chrome:{storage:{local:{get:async key=>({[key]:store[key]}),set:async patch=>Object.assign(store,patch)}},
      tabs:{query:async()=>[{id:7,url:first.url}],create:async args=>{opened.push(args);return {id:8};}},
      scripting:{executeScript:async()=>[{result:{ok:true,url:first.url,fields:{name:'First mechanic',
        headline:'Bus mechanic',location:'Lyon, France',experience:'Mécanicien\nKeolis\n2020 - 2023'}}}]},
      permissions:{request:async()=>true},runtime:{openOptionsPage:async()=>{}}}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../panel.js'),'utf8'),context);
  const tick=()=>new Promise(resolve=>setTimeout(resolve,18));await tick();
  element('capture').events.click();await tick();
  assert.equal(element('saveNext').disabled,false);
  element('saveNext').events.click();await tick();
  assert.equal(store.fleetbridgeReviewQueueV1.index,1);
  assert.equal(saved.get(first.url).profileCapture.fields.name,'First mechanic');
  assert.equal(opened.at(-1).url,second.url);
  assert.match(element('candidateTitle').textContent,/Second/);
});
