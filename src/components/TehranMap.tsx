'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Point,ICON,LABEL,CATEGORIES,genId,getPoints,savePoint,removePoint,POI_DATABASE} from '@/lib/storage';
import {findRoutes} from '@/lib/route-finder';
import {getFirstStepGuide,getTransferGuide} from '@/lib/route-guides';
import graphData from '@/data/graph.json';
import stationsData from '@/data/stations.json';
import linesData from '@/data/lines.json';
import {Graph,StationsMap,LinesMap,RouteStep,RouteResult} from '@/types/tehgo-metro';

const graph=graphData as Graph;const stations=stationsData as StationsMap;const linesDataMap=linesData as LinesMap;

const normalize=(s:string)=>s.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();

function searchPoi(q:string){
  const qn=normalize(q.trim());if(qn.length<2)return[];
  const rv:any[]=[],seen=new Set<string>();
  const add=(name:string,lat:number,lng:number,type:string,color:string,subtitle:string)=>{
    const k=name+lat.toFixed(4);if(seen.has(k))return;seen.add(k);rv.push({name,lat,lng,type,color,subtitle});
  };
  for(const[k,v]of Object.entries(stations)){
    if(v.disabled)continue;
    if(normalize(v.translations.fa).includes(qn)||normalize(v.name).includes(qn))
      add(v.translations.fa,Number(v.latitude),Number(v.longitude),'metro',v.colors[0]||'#7170ff','مترو');
  }
  for(const p of POI_DATABASE)
    if(normalize(p.name).includes(qn)||normalize(LABEL[p.category]||'').includes(qn))
      add(p.name,p.lat,p.lng,'poi','#7170ff',LABEL[p.category]);
  for(const p of getPoints())
    if(normalize(p.name).includes(qn))add(p.name,p.lat,p.lng,'user','#f59e0b',LABEL[p.category]);
  return rv.slice(0,12);
}

export default function TehranMap(){
  const mc=useRef<HTMLDivElement>(null);
  const mapRef=useRef<maplibregl.Map|null>(null);
  const markers=useRef<maplibregl.Marker[]>([]);
  const poiRef=useRef<maplibregl.Marker[]>([]);
  const metroRef=useRef<maplibregl.Marker[]>([]);
  const routeMs=useRef<maplibregl.Marker[]>([]);
  const routeLineId=useRef<string>('');

  const [pts,setPts]=useState<Point[]>([]);
  const [sq,setSq]=useState('');const [sres,setSres]=useState<any[]>([]);
  const [panel,setPanel]=useState<string|null>(null);
  const [sel,setSel]=useState<any>(null);
  const [rmode,setRmode]=useState(false);
  const [rf,setRf]=useState<any>(null);
  const [rr,setRr]=useState<any>(null);
  const [showMetro,setShowMetro]=useState(true);
  const [showPoi,setShowPoi]=useState(true);
  const [metroFrom,setMetroFrom]=useState<string|''>('');
  const [metroTo,setMetroTo]=useState<string|''>('');
  const [metroResults,setMetroResults]=useState<RouteResult[]>([]);
  const load=useCallback(()=>setPts(getPoints()),[]);

  const flyTo=(lat:number,lng:number,z=16)=>{
    mapRef.current?.flyTo({center:[lng,lat],zoom:z,duration:500});
  };

  const clearRoute=()=>{
    routeMs.current.forEach(m=>m.remove());routeMs.current=[];
    if(routeLineId.current){try{mapRef.current?.removeLayer(routeLineId.current);mapRef.current?.removeSource(routeLineId.current);}catch{}routeLineId.current='';}
    setRr(null);setRf(null);setRmode(false);setMetroResults([]);setMetroFrom('');setMetroTo('');
  };

  // ---- MAP INIT ----
  useEffect(()=>{
    if(!mc.current||mapRef.current)return;
    const map=new maplibregl.Map({
      container:mc.current,
      style:{version:8,name:'Tehran',sources:{r:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],tileSize:256,attribution:'<a href="https://carto.com/">CARTO</a>'}},layers:[{id:'base',type:'raster',source:'r'}]},
      center:[51.389,35.6892],zoom:11
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
    map.on('load',()=>{mapRef.current=map;load();setTimeout(()=>map.resize(),100);});
    return ()=>{map.remove();mapRef.current=null;};
  },[]);

  // ---- METRO STATIONS ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    metroRef.current.forEach(m=>m.remove());metroRef.current=[];
    if(!showMetro)return;
    for(const st of Object.values(stations)){
      if(st.disabled)continue;
      const color=st.colors[0]||'#71707a';
      const el=document.createElement('div');
      el.style.cssText=`width:8px;height:8px;background:${color};border:2px solid rgba(255,255,255,.8);border-radius:50%;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.3)`;
      const popup=new maplibregl.Popup({offset:10,closeButton:true}).setHTML(`<div style="font-family:Vazirmatn,system-ui;direction:rtl"><b>${st.translations.fa}</b><br/><small>${st.name}</small></div>`);
      const m=new maplibregl.Marker({element:el}).setLngLat([Number(st.longitude),Number(st.latitude)]).setPopup(popup).addTo(map);
      el.onclick=()=>{setSel({name:st.translations.fa,lat:Number(st.latitude),lng:Number(st.longitude),type:'metro',id:st.id});setPanel(null);};
      metroRef.current.push(m);
    }
  },[showMetro]);

  // ---- POI + USER MARKERS ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    markers.current.forEach(m=>m.remove());markers.current=[];
    poiRef.current.forEach(m=>m.remove());poiRef.current=[];
    if(showPoi)POI_DATABASE.forEach(p=>{
      const el=document.createElement('div');el.style.cssText='width:20px;height:20px;background:rgba(113,112,255,.2);border:2px solid rgba(113,112,255,.6);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer';el.textContent=ICON[p.category]||'📍';
      poiRef.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
    });
    pts.forEach(p=>{
      const c:any={metro:'#E31837',brt:'#1E88E5',university:'#8b5cf6',home:'#22c55e',cafe:'#d97706',shop:'#ec4899',hospital:'#e11d48',park:'#16a34a',gym:'#ea580c',library:'#6366f1',other:'#64748b'};
      const el=document.createElement('div');el.style.cssText=`width:28px;height:28px;background:${c[p.category]||'#3b82f6'};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)`;el.textContent=ICON[p.category]||'📍';
      const pop=new maplibregl.Popup({offset:20}).setHTML(`<div style="font-family:Vazirmatn,system-ui;direction:rtl"><b>${p.name}</b><br/><small>${ICON[p.category]} ${LABEL[p.category]}</small>${p.note?`<br/><span style="font-size:12px;color:#94a3b8">${p.note}</span>`:''}</div>`);
      markers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map));
    });
  },[pts,showPoi]);

  // ---- ROUTE CLICK ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const h=async(e:any)=>{
      if(!rmode)return;
      const p={lat:e.lngLat.lat,lng:e.lngLat.lng};
      if(!rf){
        setRf(p);
        const el=document.createElement('div');el.style.cssText='width:18px;height:18px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
        routeMs.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
      }else{
        try{
          const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${rf.lng},${rf.lat};${p.lng},${p.lat}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(10000)});
          const d=await r.json();
          if(d.code==='Ok'&&d.routes?.[0]){
            setRr({d:d.routes[0].distance/1000,t:d.routes[0].duration/60,isDriving:true});
            const sid='r_'+Date.now();
            map.addSource(sid,{type:'geojson',data:d.routes[0].geometry});
            map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#7170ff','line-width':5,'line-opacity':0.9}});
            map.addLayer({id:sid+'_g',type:'line',source:sid,paint:{'line-color':'#7170ff','line-width':12,'line-opacity':0.15}});
            routeLineId.current=sid;
            const b=new maplibregl.LngLatBounds();d.routes[0].geometry.coordinates.forEach((c:any)=>b.extend([c[0],c[1]]));map.fitBounds(b,{padding:80,maxZoom:15});
          }
        }catch(ex){}
        setRmode(false);
      }
    };
    map.on('click',h);return ()=>{map.off('click',h);};
  },[rmode,rf]);

  // ---- METRO ROUTING ----
  const findMetroRoute=(fromId:string,toId:string)=>{
    const results=findRoutes(graph,stations,fromId,toId,5);
    setMetroResults(results);
    if(results.length===0){alert('مسیری یافت نشد');return;}
    setRr({isMetro:true,results,d:{},t:{},stops:results[0].totalStations,transfers:results[0].totalTransfers});
    const map=mapRef.current;if(!map)return;
    clearRoute();
    const best=results[0];
    const coords=best.steps.filter(s=>stations[s.stationId]).map(s=>[Number(stations[s.stationId].longitude),Number(stations[s.stationId].latitude)]);
    if(coords.length<2)return;
    const sid='mr_'+Date.now();
    map.addSource(sid,{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});
    map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#8b5cf6','line-width':6,'line-opacity':0.85}});
    routeLineId.current=sid;
    const b=new maplibregl.LngLatBounds();coords.forEach((c:any)=>b.extend(c));map.fitBounds(b,{padding:80});
    const el=document.createElement('div');el.style.cssText='width:14px;height:14px;background:#8b5cf6;border:2px solid #fff;border-radius:50%';
    routeMs.current.push(new maplibregl.Marker({element:el}).setLngLat([Number(stations[fromId].longitude),Number(stations[fromId].latitude)]).addTo(map));
    const el2=document.createElement('div');el2.style.cssText='width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%';
    routeMs.current.push(new maplibregl.Marker({element:el2}).setLngLat([Number(stations[toId].longitude),Number(stations[toId].latitude)]).addTo(map));
    setPanel('metro-result');
  };

  const startRoute=(p:any)=>{
    clearRoute();
    const map=mapRef.current;if(!map)return;
    const el=document.createElement('div');el.style.cssText='width:18px;height:18px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    routeMs.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
    setRf(p);setRmode(true);setSel(null);setPanel(null);
  };

  const addP=(n:string,cat:Point['category'],note:string)=>{
    const c=mapRef.current?.getCenter();if(!c)return;
    savePoint({id:genId(),name:n,lat:c.lat,lng:c.lng,category:cat,createdAt:new Date().toISOString(),note:note||undefined});
    setPts(getPoints());setPanel(null);
  };

  const hSearch=(v:string)=>{setSq(v);setSres(searchPoi(v));};
  const selectSearch=(r:any)=>{setSq(r.name);setSres([]);setSel(r);flyTo(r.lat,r.lng);};

  const dynamicStyle={
    top:{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',zIndex:100,width:'min(520px,calc(100vw-20px))'} as any,
    bot:{position:'absolute',bottom:10,left:0,right:0,zIndex:100,display:'flex',justifyContent:'center',padding:'0 10px',pointerEvents:'none'} as any,
    panel:{position:'absolute',top:68,right:8,width:320,maxHeight:'calc(100dvh-90px)',background:'rgba(15,16,17,.96)',backdropFilter:'blur(24px)saturate(1.6)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:16,overflowY:'auto',zIndex:100,boxShadow:'0 8px 32px rgba(0,0,0,.4)'} as any,
    topInner:{display:'flex',gap:6,background:'rgba(15,16,17,.94)',backdropFilter:'blur(20px)saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 6px',alignItems:'center',boxShadow:'0 8px 32px rgba(0,0,0,.5)'} as any,
    botInner:{display:'flex',gap:4,background:'rgba(15,16,17,.94)',backdropFilter:'blur(20px)saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 8px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',pointerEvents:'auto',flexWrap:'wrap',justifyContent:'center'} as any,
  };

  const btn=(a=false)=>({padding:'7px 11px',borderRadius:10,fontSize:11.5,fontWeight:a?600:500,cursor:'pointer',border:a?'1px solid #5e6ad2':'1px solid rgba(255,255,255,0.06)',background:a?'rgba(94,106,210,.15)':'rgba(255,255,255,0.03)',color:a?'#7170ff':'#f7f8f8',transition:'all .15s',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:3,fontFamily:'Vazirmatn,system-ui'} as any);

  return <div style={{width:'100%',height:'100dvh',position:'relative',direction:'ltr',overflow:'hidden',background:'#08090a'}}>
    <div ref={mc} style={{width:'100%',height:'100%'}}/>

    {/* TOP */}
    <div style={dynamicStyle.top}>
      <div style={dynamicStyle.topInner}>
        <span style={{fontWeight:700,fontSize:14,whiteSpace:'nowrap',color:'#f7f8f8',padding:'0 4px'}}><span style={{color:'#7170ff'}}>تهران</span>یاب</span>
        <div style={{flex:1,position:'relative'}}>
          <input value={sq} onChange={e=>hSearch(e.target.value)} placeholder='جستجوی ایستگاه، مکان...' dir="rtl"
            style={{width:'100%',padding:'7px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,color:'#f7f8f8',fontSize:13,outline:'none',fontFamily:'Vazirmatn,system-ui'}}
            onFocus={e=>e.target.style.borderColor='rgba(113,112,255,.4)'}
            onBlur={e=>{e.target.style.borderColor='rgba(255,255,255,0.06)';setTimeout(()=>setSres([]),250)}}/>
          {sres.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'#0f1011',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,marginTop:6,padding:4,maxHeight:340,overflowY:'auto',zIndex:110,boxShadow:'0 12px 48px rgba(0,0,0,.5)'}}>
            {sres.map((r,i)=>(
              <div key={i} onClick={()=>selectSearch(r)} style={{padding:'8px 10px',cursor:'pointer',borderRadius:8,display:'flex',alignItems:'center',gap:10}}
                onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(113,112,255,.1)'}
                onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}>
                <span style={{width:10,height:10,borderRadius:'50%',background:'#7170ff',display:'inline-block',flexShrink:0}}/>
                <div style={{flex:1}}><b style={{fontSize:13}}>{r.name}</b></div>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>

    {/* BOTTOM */}
    <div style={dynamicStyle.bot}>
      <div style={dynamicStyle.botInner}>
        <button onClick={()=>setPanel(panel==='list'?null:'list')} style={btn(panel==='list')}>📍 {pts.length}</button>
        <button onClick={()=>setPanel(panel==='add'?null:'add')} style={btn(panel==='add')}>➕ جدید</button>
        <button onClick={()=>{clearRoute();setRmode(true);}} style={btn(rmode)}>🗺️ مسیر</button>
        <button onClick={()=>setPanel('metro')} style={btn(panel==='metro')}>🚇 مترو</button>
        <button onClick={()=>{setShowMetro(!showMetro);}} style={{...btn(showMetro),color:showMetro?'#a78bfa':'#f7f8f8',borderColor:showMetro?'rgba(139,92,246,.5)':'rgba(255,255,255,0.06)'}}>{showMetro?'●':'○'} ایستگاه‌ها</button>
        <button onClick={()=>setShowPoi(!showPoi)} style={{...btn(showPoi),color:showPoi?'#4ade80':'#f7f8f8',borderColor:showPoi?'rgba(34,197,94,.5)':'rgba(255,255,255,0.06)'}}>🏛️ مکان</button>
      </div>
    </div>

    {/* PANEL */}
    {(panel||sel||rr||rmode)&&<div style={dynamicStyle.panel}>
      {rmode&&<div style={{padding:10,borderRadius:10,border:'1px solid rgba(245,158,11,.3)',background:'rgba(245,158,11,.08)',marginBottom:8}}>
        <p style={{margin:'0 0 6px',fontSize:12,color:'#f59e0b'}}>{rf?'📍 مقصد را کلیک کنید':'📍 مبدأ را کلیک کنید'}</p>
        <button onClick={clearRoute} style={{background:'transparent',border:'1px solid rgba(239,68,68,.4)',borderRadius:8,padding:'6px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>❌ لغو</button>
      </div>}

      {rr&&!rr.isMetro&&rr.isDriving&&<div style={{padding:12,borderRadius:12,border:'1px solid rgba(113,112,255,.3)',background:'rgba(113,112,255,.08)',marginBottom:8}}>
        <h4 style={{margin:'0 0 6px',color:'#7170ff',fontSize:14}}>🗺️ مسیریاب ماشین</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}><div style={{fontSize:11,color:'#8a8f98'}}>فاصله</div><div style={{fontWeight:700,fontSize:18,color:'#7170ff'}}>{rr.d?.toFixed(1)} کیلومتر</div></div>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}><div style={{fontSize:11,color:'#8a8f98'}}>زمان</div><div style={{fontWeight:700,fontSize:18,color:'#22c55e'}}>~{rr.t?.toFixed(0)} دقیقه</div></div>
        </div>
        <button onClick={clearRoute} style={{width:'100%',marginTop:8,background:'transparent',border:'1px solid rgba(239,68,68,.4)',borderRadius:8,padding:'6px',color:'#ef4444',cursor:'pointer',fontSize:12}}>❌ پاک کردن مسیر</button>
      </div>}

      {rr&&rr.isMetro&&<div style={{marginBottom:8}}>
        <h4 style={{margin:'0 0 6px',color:'#a78bfa',fontSize:14}}>🚇 مسیریاب مترو</h4>
        {metroResults.length>0&&<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:8}}>
            <div style={{padding:'8px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)'}}><div style={{fontSize:11,color:'#8a8f98'}}>بهترین مسیر</div><div style={{fontWeight:700,fontSize:16,color:'#a78bfa'}}>{metroResults[0].totalStations} ایستگاه</div></div>
            <div style={{padding:'8px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)'}}><div style={{fontSize:11,color:'#8a8f98'}}>تغییر خط</div><div style={{fontWeight:700,fontSize:16,color:'#f59e0b'}}>{metroResults[0].totalTransfers} بار</div></div>
          </div>
          <div style={{fontSize:11,color:'#8a8f98',marginBottom:6}}>خطوط: {metroResults[0].lines.join(', ')} | {metroResults.length} مسیر</div>
        </>}
        <button onClick={()=>setPanel('metro')} style={{width:'100%',background:'rgba(139,92,246,.12)',border:'1px solid rgba(139,92,246,.3)',borderRadius:8,padding:'7px',color:'#a78bfa',cursor:'pointer',fontSize:12}}>🔄 تغییر مسیر مترو</button>
        <button onClick={clearRoute} style={{width:'100%',marginTop:6,background:'transparent',border:'1px solid rgba(239,68,68,.4)',borderRadius:8,padding:'6px',color:'#ef4444',cursor:'pointer',fontSize:12}}>❌ پاک کردن مسیر</button>
      </div>}

      {sel&&<div style={{padding:10,borderRadius:10,border:'1px solid rgba(255,255,255,0.06)',marginBottom:8,background:'rgba(255,255,255,0.02)'}}>
        <h4 style={{margin:'0 0 2px',fontSize:14}}>🚇 {sel.name}</h4>
        <p style={{margin:'0 0 8px',fontSize:12,color:'#8a8f98'}}>{sel.type==='metro'?'ایستگاه مترو':'مکان'}</p>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>flyTo(sel.lat,sel.lng)} style={{flex:1,background:'#5e6ad2',border:'none',borderRadius:8,padding:'7px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12}}>📍 نمایش</button>
          <button onClick={()=>startRoute(sel)} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'7px',color:'#f7f8f8',cursor:'pointer',fontSize:12}}>🗺️ مسیر ماشین</button>
        </div>
        {sel.type==='metro'&&sel.id&&<div style={{marginTop:6}}><button onClick={()=>{setMetroFrom(sel.id);setPanel('metro');}} style={{width:'100%',background:'rgba(139,92,246,.12)',border:'1px solid rgba(139,92,246,.3)',borderRadius:8,padding:'7px',color:'#a78bfa',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>🚇 مسیریابی مترو از اینجا</button></div>}
      </div>}

      {panel==='metro'&&<div>
        <h4 style={{fontSize:14,marginBottom:8,color:'#f7f8f8'}}>🚇 مسیریاب مترو تهران</h4>
        <p style={{fontSize:12,color:'#8a8f98',marginBottom:6}}>مبدأ و مقصد را انتخاب کن</p>
        <div style={{display:'flex',gap:4,marginBottom:6,alignItems:'center'}}>
          <select value={metroFrom} onChange={e=>setMetroFrom(e.target.value)} style={{flex:1,padding:'7px 8px',borderRadius:8,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'#f7f8f8',fontSize:12,outline:'none',fontFamily:'Vazirmatn,system-ui'}}>
            <option value=''>مبدأ</option>
            {Object.entries(stations).filter(([_,v]:any)=>!v.disabled).sort().map(([id,st]:any)=><option key={id} value={id}>{st.translations.fa}</option>)}
          </select>
          <span style={{color:'#8a8f98'}}>→</span>
          <select value={metroTo} onChange={e=>setMetroTo(e.target.value)} style={{flex:1,padding:'7px 8px',borderRadius:8,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'#f7f8f8',fontSize:12,outline:'none',fontFamily:'Vazirmatn,system-ui'}}>
            <option value=''>مقصد</option>
            {Object.entries(stations).filter(([_,v]:any)=>!v.disabled&&(v.id as string)!==metroFrom).sort().map(([id,st]:any)=><option key={id} value={id}>{st.translations.fa}</option>)}
          </select>
        </div>
        <button onClick={()=>{if(metroFrom&&metroTo)findMetroRoute(metroFrom,metroTo);}} disabled={!metroFrom||!metroTo}
          style={{width:'100%',background:'#5e6ad2',border:'none',borderRadius:8,padding:'9px',color:'white',cursor:'pointer',fontWeight:600,fontSize:13,opacity:(!metroFrom||!metroTo)?0.5:1,fontFamily:'Vazirmatn,system-ui'}}>
          🔍 پیدا کردن مسیر</button>
        <div style={{marginTop:8,maxHeight:320,overflowY:'auto'}}>
          <p style={{fontSize:11.5,color:'#8a8f98',marginBottom:4}}>انتخاب سریع ایستگاه‌های پررفتوآمد:</p>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {['tajrish','shahid_beheshti','meydan_e_hazrat_vali_asr','imam_hossein','imam_khomeini','tehran_sadeghiyeh','darvazeh_dolat','shoush','meydan_e_azadi','farhangsara'].map(id=>{
              const st=stations[id];if(!st||st.disabled)return null;
              return <button key={id} onClick={()=>{if(!metroFrom)setMetroFrom(id);else if(!metroTo&&id!==metroFrom)setMetroTo(id);}}
                style={{padding:'4px 8px',borderRadius:6,background:'rgba(113,112,255,0.1)',border:'1px solid rgba(113,112,255,0.2)',color:'#a78bfa',cursor:'pointer',fontSize:10,fontFamily:'Vazirmatn,system-ui'}}>{st.translations.fa}</button>
            })}
          </div>
        </div>
      </div>}

      {panel==='list'&&<div>
        <h4 style={{fontSize:14,marginBottom:6,color:'#f7f8f8'}}>📍 نقاط من ({pts.length})</h4>
        {pts.length===0?<p style={{color:'#8a8f98',textAlign:'center',fontSize:12}}>نقطه‌ای ذخیره نشده</p>:pts.map(p=>(
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10}}
            onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(255,255,255,0.03)'}
            onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}>
            <span>{ICON[p.category]||'📍'}</span>
            <div style={{flex:1}}><b style={{fontSize:13}}>{p.name}</b><br/><span style={{fontSize:11,color:'#8a8f98'}}>{LABEL[p.category]||'سایر'}</span></div>
            <button onClick={()=>flyTo(p.lat,p.lng)} style={{background:'transparent',border:'none',color:'#7170ff',cursor:'pointer',padding:2}}>📍</button>
            <button onClick={()=>{removePoint(p.id);setPts(getPoints());}} style={{background:'transparent',border:'none',color:'#ef4444',cursor:'pointer',padding:2}}>×</button>
          </div>
        ))}</div>}

      {panel==='add'&&<AddForm onSubmit={addP} onCancel={()=>setPanel(null)}/>}
    </div>}
  </div>;
}

function AddForm({onSubmit,onCancel}:{onSubmit:(n:string,c:Point['category'],no:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState('');const [cat,setCat]=useState<Point['category']>('other');const [note,setNote]=useState('');
  return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSubmit(name.trim(),cat,note.trim());}}>
    <h4 style={{fontSize:14,marginBottom:2,color:'#f7f8f8'}}>➕ نقطه جدید</h4>
    <p style={{fontSize:11.5,color:'#8a8f98',marginBottom:8}}>موقعیت فعلی مرکز نقشه ذخیره می‌شه.</p>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder='مثلاً: دانشگاه فرهنگیان مفتح' dir="rtl" style={{width:'100%',padding:'9px 12px',marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#f7f8f8',fontSize:13,outline:'none',fontFamily:'Vazirmatn,system-ui'}}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginBottom:8}}>
      {CATEGORIES.map(c=><button key={c} type='button' onClick={()=>setCat(c)} style={cat===c?{padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'#5e6ad2',border:'none',color:'white',fontWeight:600}:{padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',color:'#d0d6e0',fontFamily:'Vazirmatn,system-ui'}}>{ICON[c]} {LABEL[c]}</button>)}
    </div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder='یادداشت (اختیاری)' rows={2} dir="rtl" style={{width:'100%',padding:'9px 12px',marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#f7f8f8',fontSize:13,resize:'none',outline:'none',fontFamily:'Vazirmatn,system-ui'}}/>
    <div style={{display:'flex',gap:6}}>
      <button type='submit' style={{flex:1,background:'#5e6ad2',border:'none',borderRadius:8,padding:'9px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>✅ ذخیره</button>
      <button type='button' onClick={onCancel} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'9px 14px',color:'#d0d6e0',cursor:'pointer',fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>انصراف</button>
    </div>
  </form>;
}
