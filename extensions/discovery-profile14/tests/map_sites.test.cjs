const test=require('node:test');
const assert=require('node:assert/strict');
const {project,inverse,valid,clusters}=require('../real_map.js');
const sites=require('../ratp_sites.js');

test('true map uses reversible Web Mercator coordinates and viewport clusters',()=>{
  for(const [lat,lon,z] of [[48.85,2.35,9],[34.1,-6.8,7],[0,0,3]]){
    const p=project(lat,lon,z),back=inverse(p.x,p.y,z);
    assert.ok(Math.abs(back.lat-lat)<1e-6);
    assert.ok(Math.abs(back.lon-lon)<1e-6);
  }
  assert.equal(valid({lat:null,lon:null}),false);
  assert.equal(valid({lat:48.85,lon:2.35}),true);
  assert.equal(clusters([{lat:48.85,lon:2.35},{lat:48.85,lon:2.35}],p=>project(p.lat,p.lon,5)).length,1);
});

test('RATP group registry rejects closed and non-geocoded sites without guessing coordinates',()=>{
  const data={siret:'77566343800017',latitude:48.8,longitude:2.4,enseigne:'CENTRE BUS NANTERRE',etat_administratif:'A'};
  const site=sites.normalize(data,'RATP');
  assert.equal(site.category,'Bus depot / operations');
  assert.equal(site.lat,48.8);
  assert.equal(sites.normalize({...data,etat_administratif:'F'},'RATP'),null);
  assert.equal(sites.normalize({...data,latitude:null,longitude:null},'RATP'),null);
  assert.equal(sites.normalize(data,'AN UNRELATED COMPANY'),null);
  assert.equal(sites.SEED.length,1);
});

test('official registry refresh merges cached sites and keeps the known headquarters',async()=>{
  const fake={
    results:[{siren:'775663438',nom_raison_sociale:'REGIE AUTONOME DES TRANSPORTS PARISIENS',
      siege:{siret:'77566343801906',latitude:48.842687714,longitude:2.3720426172,etat_administratif:'A'},
      nombre_etablissements_ouverts:254,
      matching_etablissements:[{siret:'77566343877777',latitude:48.95,longitude:2.30,
        adresse:'Centre bus',enseigne:'CENTRE BUS ASNIERES',etat_administratif:'A'}]}],total_results:1
  };
  const cache={},storage={get:async()=>cache,set:async patch=>Object.assign(cache,patch)};
  const refreshed=await sites.sync(storage,async()=>({ok:true,json:async()=>fake}));
  assert.equal(refreshed.sites.length,2);
  assert.equal(refreshed.partial,true,'a text search must not claim complete coverage of 254 open sites');
  const second=await sites.sync(storage,async()=>({ok:true,json:async()=>({results:[],total_results:0})}));
  assert.equal(second.sites.length,2,'later empty result preserves prior verified sites');
});
