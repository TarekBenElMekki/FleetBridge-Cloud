/* Real, slippy Web Mercator tile map. Loads viewport tiles only (no prefetch).
 * Browser-local pins; no profile data is sent to the tile provider. */
(function(root){
  'use strict';
  const TILE=256,MAX_LAT=85.05112878;
  function project(lat,lon,z){
    const n=2**z,yLat=Math.max(-MAX_LAT,Math.min(MAX_LAT,Number(lat)))*Math.PI/180;
    return {x:(Number(lon)+180)/360*n*TILE,
      y:(1-Math.log(Math.tan(yLat)+1/Math.cos(yLat))/Math.PI)/2*n*TILE};
  }
  function inverse(x,y,z){
    const n=2**z*TILE,angle=Math.PI*(1-2*y/n);
    return {lat:180/Math.PI*Math.atan(Math.sinh(angle)),lon:360*x/n-180};
  }
  function valid(item){return item&&item.lat!=null&&item.lon!=null&&item.lat!==''&&item.lon!==''&&
    Number.isFinite(Number(item.lat))&&Number.isFinite(Number(item.lon))&&
    Math.abs(Number(item.lat))<=90&&Math.abs(Number(item.lon))<=180;}
  function clusters(items,projection,cell=43){
    const cells=new Map();
    for(const item of items.filter(valid)){
      const p=projection(item),key=`${Math.floor(p.x/cell)}:${Math.floor(p.y/cell)}`;
      if(!cells.has(key))cells.set(key,{x:p.x,y:p.y,items:[]});
      cells.get(key).items.push(item);
    }return [...cells.values()];
  }
  function text(tag,value){const el=document.createElement(tag);el.textContent=String(value||'');return el;}
  function create(host,{onCandidate=()=>{}}={}){
    const layer=document.createElement('div'),tileHost=document.createElement('div'),pins=document.createElement('div');
    layer.className='slippy-world';tileHost.className='map-tile-layer';pins.className='map-pin-layer';
    layer.append(tileHost,pins);host.append(layer);
    const control=document.createElement('div');control.className='map-controls';
    const zoomIn=text('button','+'),zoomOut=text('button','−'),home=text('button','France');
    for(const b of [zoomIn,zoomOut,home]){b.type='button';b.className='map-control';control.append(b);}host.append(control);
    const popup=document.createElement('div');popup.className='map-popup hidden';host.append(popup);
    const attr=document.createElement('div');attr.className='map-attribution';
    const link=document.createElement('a');link.href='https://www.openstreetmap.org/copyright';
    link.target='_blank';link.rel='noopener';link.textContent='© OpenStreetMap contributors';
    attr.append('Map data ',link,' · ODbL');host.append(attr);
    const state={center:{lat:47.1,lon:2.2},zoom:5,items:[],destroyed:false};
    let down=null,resizeObserver=null;
    function viewport(){return {w:host.clientWidth||850,h:host.clientHeight||440};}
    function pixel(item){
      const {w,h}=viewport(),center=project(state.center.lat,state.center.lon,state.zoom),p=project(item.lat,item.lon,state.zoom);
      const world=TILE*2**state.zoom;let dx=p.x-center.x;
      if(dx>world/2)dx-=world;if(dx< -world/2)dx+=world;
      return {x:w/2+dx,y:h/2+p.y-center.y};
    }
    function locationLabel(item){return [item.name||item.company||'Location',item.address||item.location||''].filter(Boolean).join(' · ');}
    function selectItems(items){
      popup.replaceChildren();popup.classList.remove('hidden');
      const head=document.createElement('div');head.className='map-popup-title';
      head.append(text('strong',items.length===1?'Location':`${items.length} locations`));
      const close=text('button','×');close.type='button';close.setAttribute('aria-label','Close map details');
      close.addEventListener('click',()=>popup.classList.add('hidden'));head.append(close);popup.append(head);
      for(const item of items.slice(0,70)){
        const b=text('button',locationLabel(item));b.type='button';b.className='map-detail';
        b.addEventListener('click',()=>{
          if(item.kind==='candidate')onCandidate(item.url);
          else {state.center={lat:Number(item.lat),lon:Number(item.lon)};state.zoom=Math.max(state.zoom,10);render();}
        });popup.append(b);
      }
      if(items.length>70)popup.append(text('small',`${items.length-70} additional markers in this cluster; zoom in to separate them.`));
    }
    function tiles(){
      const {w,h}=viewport(),z=state.zoom,n=2**z,center=project(state.center.lat,state.center.lon,z);
      const startX=Math.floor((center.x-w/2)/TILE),endX=Math.floor((center.x+w/2)/TILE);
      const startY=Math.max(0,Math.floor((center.y-h/2)/TILE)),endY=Math.min(n-1,Math.floor((center.y+h/2)/TILE));
      const requested=new Set();for(let tx=startX;tx<=endX;tx++)for(let ty=startY;ty<=endY;ty++){
        const x=((tx%n)+n)%n,key=`${z}/${x}/${ty}`;requested.add(`${tx}:${ty}:${key}`);
      }
      // Reuse tiles already displayed while panning, without prefetching.
      const old=new Map([...tileHost.children].map(el=>[el.dataset.tileKey,el]));
      for(const entry of requested){
        let el=old.get(entry);const [tx,ty,key]=entry.split(':');
        if(!el){el=document.createElement('img');el.alt='';el.decoding='async';el.loading='lazy';
          el.dataset.tileKey=entry;el.draggable=false;el.src=`https://tile.openstreetmap.org/${key}.png`;tileHost.append(el);
          el.addEventListener('error',()=>{el.classList.add('tile-unavailable');});
        }else old.delete(entry);
        const position={x:Number(tx)*TILE-center.x+w/2,y:Number(ty)*TILE-center.y+h/2};
        el.style.transform=`translate(${Math.round(position.x)}px,${Math.round(position.y)}px)`;
      }
      for(const el of old.values())el.remove();
    }
    function markers(){
      const {w,h}=viewport();pins.replaceChildren();
      const visible=state.items.filter(item=>{
        if(!valid(item))return false;const p=pixel(item);return p.x>=-30&&p.x<=w+30&&p.y>=-30&&p.y<=h+30;
      });
      for(const cluster of clusters(visible,pixel)){
        const first=cluster.items[0],candidate=first.kind==='candidate';
        const marker=text('button',cluster.items.length>1?String(cluster.items.length):'📌');
        marker.type='button';marker.className=`map-thumbtack ${candidate?'candidate-pin':'ratp-pin'}${cluster.items.length>1?' cluster-pin':''}`;
        marker.title=cluster.items.length>1?`${cluster.items.length} places`:locationLabel(first);
        marker.setAttribute('aria-label',marker.title);
        marker.style.left=`${cluster.x}px`;marker.style.top=`${cluster.y}px`;
        marker.addEventListener('click',event=>{event.stopPropagation();selectItems(cluster.items);});
        pins.append(marker);
      }
    }
    function render(){if(state.destroyed)return;tiles();markers();}
    function setItems(items){state.items=items.filter(valid);render();}
    function setZoom(newZoom){
      const zoom=Math.max(2,Math.min(15,Math.round(newZoom)));if(zoom===state.zoom)return;
      state.zoom=zoom;render();
    }
    function focus(lat,lon,zoom=10){
      if(!valid({lat,lon}))return;
      state.center={lat:Number(lat),lon:Number(lon)};state.zoom=Math.max(2,Math.min(15,zoom));render();
    }
    zoomIn.addEventListener('click',()=>setZoom(state.zoom+1));zoomOut.addEventListener('click',()=>setZoom(state.zoom-1));
    home.addEventListener('click',()=>focus(47.1,2.2,5));
    host.addEventListener('pointerdown',e=>{
      if(e.target.closest('button,a'))return;
      down={x:e.clientX,y:e.clientY,center:project(state.center.lat,state.center.lon,state.zoom)};
      host.setPointerCapture?.(e.pointerId);popup.classList.add('hidden');
    });
    host.addEventListener('pointermove',e=>{
      if(!down)return;
      const at=inverse(down.center.x-(e.clientX-down.x),down.center.y-(e.clientY-down.y),state.zoom);
      state.center={lat:Math.max(-MAX_LAT,Math.min(MAX_LAT,at.lat)),lon:Math.max(-180,Math.min(180,at.lon))};render();
    });
    const release=()=>{down=null;};host.addEventListener('pointerup',release);host.addEventListener('pointercancel',release);
    host.addEventListener('wheel',event=>{event.preventDefault();setZoom(state.zoom+(event.deltaY<0?1:-1));},{passive:false});
    if(typeof ResizeObserver!=='undefined'){resizeObserver=new ResizeObserver(render);resizeObserver.observe(host);}
    render();
    return {setItems,focus,render,get zoom(){return state.zoom;},destroy(){state.destroyed=true;resizeObserver?.disconnect();}};
  }
  const api={project,inverse,valid,clusters,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.FBMap=api;
})(typeof globalThis!=='undefined'?globalThis:this);
