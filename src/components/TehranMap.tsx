'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {Point,ICON,LABEL,CATEGORIES,genId,getPoints,savePoint,removePoint,POI_DATABASE} from '@/lib/storage';
import {getStations,getStationById} from '@/services/metro';
import {buildGraph} from '@/services/graph';
import {findShortestPath} from '@/services/dijkstra';

const normalize=(s:string)=>s.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();

function searchPoi(q:string){
  const qn=normalize(q.trim());if(qn.length<2)return[];
  const rv:any[]=[],seen=new Set<string>();
  const add=(name:string,lat:number,lng:number,type:string,color:string,subtitle:string)=>{
    const k=name+lat.toFixed(4);if(seen.has(k))return;seen.add(k);rv.push({name,lat,lng,type,color,subtitle});
  };
  // Metro stations (from sharyaan data - 150 stations)
  for(const st of getStations()){
    if(!st.disabled && (normalize(st.nameFa).includes(qn)||normalize(st.name).includes(qn)))
      add(st.nameFa,st.latitude,st.longitude,'metro','#5e6ad2',`خط ${st.lines.join(',')}`);
  }
  // POI
  for(const p of POI_DATABASE)
    if(normalize(p.name).includes(qn)||normalize(LABEL[p.category]||'').includes(qn))
      add(p.name,p.lat,p.lng,'poi','#7170ff',LABEL[p.category]);
  // User points
  for(const p of getPoints())
    if(normalize(p.name).includes(qn))
      add(p.name,p.lat,p.lng,'user','#f59e0b',LABEL[p.category]);
  return rv.slice(0,12);
}

export default function TehranMap(){
  const mc=useRef<HTMLDivElement>(null);
  const mapRef=useRef<maplibregl.Map|null>(null);
  const markers=useRef<maplibregl.Marker[]>([]);
  const poiRef=useRef<maplibregl.Marker[]>([]);
  const metroDots=useRef<maplibregl.Marker[]>([]);
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
  const load=useCallback(()=>setPts(getPoints()),[]);

  const flyTo=(lat:number,lng:number,z=16)=>{
    mapRef.current?.flyTo({center:[lng,lat],zoom:z,duration:500});
  };

  const clearRoute=()=>{
    routeMs.current.forEach(m=>m.remove());routeMs.current=[];
    if(routeLineId.current){try{mapRef.current?.removeLayer(routeLineId.current);mapRef.current?.removeSource(routeLineId.current);}catch{}routeLineId.current='';}
    setRr(null);setRf(null);setRmode(false);
  };

  // ---- CENTERED COLOR MAP ----
  const lineColors:{[k:number]:string}={1:'#E31837',2:'#005BAA',3:'#008C3A',4:'#FFC20E',5:'#8B5CF6',6:'#FF6B35',7:'#F5A623'};

  // ---- MAP INIT ----
  useEffect(()=>{
    if(!mc.current||mapRef.current)return;
    const map=new maplibregl.Map({
      container:mc.current,
      style:{
        version:8,name:'Tehran',
        sources:{r:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],tileSize:256,attribution:'<a href="https://carto.com/">CARTO</a>'}},
        layers:[{id:'base',type:'raster',source:'r'}]
      },
      center:[51.389,35.6892],zoom:11
    });
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
    map.on('load',()=>{mapRef.current=map;load();setTimeout(()=>map.resize(),100);});
    return ()=>{map.remove();mapRef.current=null;};
  },[]);

  // ---- METRO STATIONS (150 dots from sharyaan) ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    metroDots.current.forEach(m=>m.remove());metroDots.current=[];
    if(!showMetro)return;
    for(const st of getStations()){
      if(st.disabled)continue;
      const color=st.colors[0]||'#71707a';
      const el=document.createElement('div');
      el.style.cssText=`width:20px;height:20px;background:${color};border:2px solid #fff;border-radius:50%;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center`;
      el.title=st.nameFa;
      const popup=new maplibregl.Popup({offset:15,closeButton:true,closeOnClick:false})
        .setHTML(`<div style="font-family:Vazirmatn,system-ui;direction:rtl"><b>${st.nameFa}</b><br/><small>خط ${st.lines.join(' - ')}</small></div>`);
      const m=new maplibregl.Marker({element:el}).setLngLat([st.longitude,st.latitude]).setPopup(popup).addTo(map);
      el.onclick=()=>{
        setSel({name:st.nameFa,lat:st.latitude,lng:st.longitude,type:'metro',id:st.id,lines:st.lines,colors:st.colors});
        setPanel(null);
      };
      metroDots.current.push(m);
    }
  },[showMetro]);

  // ---- POI + USER MARKERS ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    markers.current.forEach(m=>m.remove());markers.current=[];
    poiRef.current.forEach(m=>m.remove());poiRef.current=[];

    if(showPoi)POI_DATABASE.forEach(p=>{
      const el=document.createElement('div');
      el.style.cssText='width:22px;height:22px;background:rgba(113,112,255,.2);border:2px solid rgba(113,112,255,.6);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;cursor:pointer';
      el.textContent=ICON[p.category]||'📍';
      const pop=new maplibregl.Popup({offset:15}).setHTML(`<div style="font-family:Vazirmatn,system-ui;direction:rtl"><b>${p.name}</b><br/><small>${ICON[p.category]} ${LABEL[p.category]}</small></div>`);
      poiRef.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map));
    });

    pts.forEach(p=>{
      const colors:any={metro:'#E31837',brt:'#1E88E5',university:'#8b5cf6',home:'#22c55e',cafe:'#d97706',shop:'#ec4899',hospital:'#e11d48',park:'#16a34a',gym:'#ea580c',library:'#6366f1',other:'#64748b'};
      const el=document.createElement('div');
      el.style.cssText=`width:30px;height:30px;background:${colors[p.category]||'#3b82f6'};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)`;
      el.textContent=ICON[p.category]||'📍';
      const pop=new maplibregl.Popup({offset:20}).setHTML(`<div style="font-family:Vazirmatn,system-ui;direction:rtl"><b>${p.name}</b><br/><small>${ICON[p.category]} ${LABEL[p.category]}</small>${p.note?`<br/><span style="font-size:12px;color:#94a3b8">${p.note}</span>`:''}</div>`);
      markers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map));
    });
  },[pts,showPoi]);

  // ---- ROUTE CLICK HANDLER ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const h=async(e:any)=>{
      if(!rmode)return;
      const p={lat:e.lngLat.lat,lng:e.lngLat.lng};
      if(!rf){
        setRf(p);
        const el=document.createElement('div');
        el.style.cssText='width:18px;height:18px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
        routeMs.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
      }else{
        try{
          const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${rf.lng},${rf.lat};${p.lng},${p.lat}?overview=full&geometries=geojson`,{signal:AbortSignal.timeout(10000)});
          const d=await r.json();
          if(d.code==='Ok'&&d.routes?.[0]){
            setRr({d:d.routes[0].distance/1000,t:d.routes[0].duration/60});
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
    map.on('click',h);
    return ()=>{map.off('click',h);};
  },[rmode,rf]);

  // ---- METRO ROUTING (Dijkstra) ----
  const findMetroRoute=(fromId:string,toId:string)=>{
    const stations=getStations();
    const graph=buildGraph(stations);
    const result=findShortestPath(graph,fromId,toId);
    if(!result){alert('مسیری بین این ایستگاه‌ها یافت نشد');return;}
    const map=mapRef.current;if(!map)return;
    clearRoute();
    // Draw route on map
    const coords=result.stations.map(s=>[s.longitude,s.latitude]);
    if(coords.length<2)return;
    const sid='mr_'+Date.now();
    map.addSource(sid,{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});
    map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#8b5cf6','line-width':6,'line-opacity':0.85}});
    routeLineId.current=sid;
    const b=new maplibregl.LngLatBounds();coords.forEach((c:any)=>b.extend(c));map.fitBounds(b,{padding:80});
    setRr({d:0,t:result.estimatedMinutes,stations:result.stations,stops:result.stops,transfers:result.transfers,lines:result.linesUsed,isMetro:true});
    const el=document.createElement('div');el.style.cssText='width:14px;height:14px;background:#8b5cf6;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    routeMs.current.push(new maplibregl.Marker({element:el}).setLngLat([result.origin.longitude,result.origin.latitude]).addTo(map));
    const el2=document.createElement('div');el2.style.cssText='width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
    routeMs.current.push(new maplibregl.Marker({element:el2}).setLngLat([result.destination.longitude,result.destination.latitude]).addTo(map));
  };

  const startRoute=(p:any)=>{
    clearRoute();const map=mapRef.current;if(!map)return;
    const el=document.createElement('div');
    el.style.cssText='width:18px;height:18px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4)';
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

  const style={
    full:{width:'100%',height:'100dvh',position:'relative',direction:'ltr',overflow:'hidden',background:'#08090a'} as any,
    map:{width:'100%',height:'100%'} as any,
    top:{position:'absolute',top:10,left:'50%',transform:'translateX(-50%)',zIndex:100,width:'min(520px,calc(100vw-20px))'} as any,
    topI:{display:'flex',gap:6,background:'rgba(15,16,17,.94)',backdropFilter:'blur(20px)saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 6px',alignItems:'center',boxShadow:'0 8px 32px rgba(0,0,0,.5)'} as any,
    inp:{width:'100%',padding:'7px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,color:'#f7f8f8',fontSize:13,outline:'none',fontFamily:'Vazirmatn,system-ui'} as any,
    drop:{position:'absolute',top:'100%',left:0,right:0,background:'#0f1011',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,marginTop:6,padding:4,maxHeight:340,overflowY:'auto',zIndex:110,boxShadow:'0 12px 48px rgba(0,0,0,.5)'} as any,
    bot:{position:'absolute',bottom:10,left:0,right:0,zIndex:100,display:'flex',justifyContent:'center',padding:'0 10px',pointerEvents:'none'} as any,
    botI:{display:'flex',gap:4,background:'rgba(15,16,17,.94)',backdropFilter:'blur(20px)saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 8px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',pointerEvents:'auto',flexWrap:'wrap',justifyContent:'center'} as any,
    panel:{position:'absolute',top:68,right:8,width:320,maxHeight:'calc(100dvh-90px)',background:'rgba(15,16,17,.96)',backdropFilter:'blur(24px)saturate(1.6)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:16,overflowY:'auto',zIndex:100,boxShadow:'0 8px 32px rgba(0,0,0,.4)'} as any,
  };
  const btn=(a=false)=>({padding:'7px 11px',borderRadius:10,fontSize:11.5,fontWeight:a?600:500,cursor:'pointer',border:a?'1px solid #5e6ad2':'1px solid rgba(255,255,255,0.06)',background:a?'rgba(94,106,210,.15)':'rgba(255,255,255,0.03)',color:a?'#7170ff':'#f7f8f8',transition:'all .15s',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:3,fontFamily:'Vazirmatn,system-ui'} as any);

  return <div style={style.full}>
    <div ref={mc} style={style.map}/>

    {/* Top bar */}
    <div style={style.top}>
      <div style={style.topI}>
        <span style={{fontWeight:700,fontSize:14,whiteSpace:'nowrap',color:'#f7f8f8',padding:'0 4px'}}>
          <span style={{color:'#7170ff'}}>تهران</span>یاب</span>
        <div style={{flex:1,position:'relative'}}>
          <input value={sq} onChange={e=>hSearch(e.target.value)} placeholder='جستجوی ایستگاه مترو، مکان...' dir="rtl" style={style.inp}
            onFocus={e=>e.target.style.borderColor='rgba(113,112,255,.4)'}
            onBlur={e=>{e.target.style.borderColor='rgba(255,255,255,0.06)';setTimeout(()=>setSres([]),250)}}/>
          {sres.length>0&&<div style={style.drop}>
            {sres.map((r,i)=>(
              <div key={i} onClick={()=>selectSearch(r)} style={{padding:'8px 10px',cursor:'pointer',borderRadius:8,display:'flex',alignItems:'center',gap:10}}
                onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(113,112,255,.1)'}
                onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}>
                <span style={{width:10,height:10,borderRadius:'50%',background:r.color||'#7170ff',display:'inline-block',flexShrink:0}}/>
                <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{r.name}</div><div style={{fontSize:11,color:'#8a8f98'}}>{r.subtitle||''}</div></div>
                <span style={{fontSize:10,color:'#8a8f98',background:'rgba(255,255,255,0.04)',borderRadius:6,padding:'2px 6px'}}>{r.type==='metro'?'🚇':r.type==='poi'?'📍':'⭐'}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>

    {/* Bottom bar */}
    <div style={style.bot}>
      <div style={style.botI}>
        <button onClick={()=>setPanel(panel==='list'?null:'list')} style={btn(panel==='list')}>📍 {pts.length}</button>
        <button onClick={()=>setPanel(panel==='add'?null:'add')} style={btn(panel==='add')}>➕ جدید</button>
        <button onClick={()=>{clearRoute();setRmode(true);}} style={btn(rmode)}>🗺️ مسیر</button>
        <button onClick={()=>{setShowMetro(!showMetro);}} style={{...btn(showMetro),borderColor:showMetro?'rgba(94,106,210,.5)':'rgba(255,255,255,0.06)',color:showMetro?'#a78bfa':'#f7f8f8'}}>🚇 مترو</button>
        <button onClick={()=>setShowPoi(!showPoi)} style={{...btn(showPoi),borderColor:showPoi?'rgba(34,197,94,.5)':'rgba(255,255,255,0.06)',color:showPoi?'#4ade80':'#f7f8f8'}}>🏛️ مکان‌ها</button>
      </div>
    </div>

    {/* Panel */}
    {(panel||sel||rr||rmode)&&<div style={style.panel}>
      {rmode&&<div style={{padding:10,borderRadius:10,border:'1px solid rgba(245,158,11,.3)',background:'rgba(245,158,11,.08)',marginBottom:8}}>
        <p style={{margin:'0 0 6px',fontSize:12,color:'#f59e0b'}}>{rf?'📍 مقصد را کلیک کنید':'📍 مبدأ را کلیک کنید'}</p>
        <button onClick={clearRoute} style={{background:'transparent',border:'1px solid rgba(239,68,68,.4)',borderRadius:8,padding:'6px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>❌ لغو</button>
      </div>}

      {rr&&<div style={{padding:12,borderRadius:12,border:'1px solid rgba(113,112,255,.3)',background:'rgba(113,112,255,.08)',marginBottom:8}}>
        <h4 style={{margin:'0 0 6px',color:'#7170ff',fontSize:14}}>🗺️ مسیریابی</h4>
        {rr.isMetro?<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
            <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
              <div style={{fontSize:11,color:'#8a8f98'}}>ایستگاه‌ها</div><div style={{fontWeight:700,fontSize:18,color:'#a78bfa'} as any}>{rr.stops}</div></div>
            <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
              <div style={{fontSize:11,color:'#8a8f98'}}>زمان</div><div style={{fontWeight:700,fontSize:18,color:'#22c55e'}}>~{rr.t} دقیقه</div></div>
          </div>
          <div style={{fontSize:11,color:'#8a8f98',display:'flex',gap:8,flexWrap:'wrap'}}>
            {rr.transfers>0&&<span>🔄 {rr.transfers} تغییر خط</span>}
            <span>🚇 خط {rr.lines.join(', ')}</span>
          </div>
        </>:<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
            <div style={{fontSize:11,color:'#8a8f98'}}>فاصله</div><div style={{fontWeight:700,fontSize:18,color:'#7170ff'}}>{rr.d?.toFixed(1)} کیلومتر</div></div>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
            <div style={{fontSize:11,color:'#8a8f98'}}>زمان</div><div style={{fontWeight:700,fontSize:18,color:'#22c55e'}}>~{rr.t?.toFixed(0)} دقیقه</div></div>
        </div>}
        <button onClick={clearRoute} style={{width:'100%',marginTop:8,background:'transparent',border:'1px solid rgba(239,68,68,.4)',borderRadius:8,padding:'6px',color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>❌ پاک کردن مسیر</button>
      </div>}

      {sel&&<div style={{padding:10,borderRadius:10,border:'1px solid rgba(255,255,255,0.06)',marginBottom:8,background:'rgba(255,255,255,0.02)'}}>
        <h4 style={{margin:'0 0 2px',fontSize:14}}>🚇 {sel.name}</h4>
        <p style={{margin:'0 0 8px',fontSize:12,color:'#8a8f98'}}>خط {sel.lines?.join(', ')}</p>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>flyTo(sel.lat,sel.lng)} style={{flex:1,background:'#5e6ad2',border:'none',borderRadius:8,padding:'7px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>📍 نمایش</button>
          <button onClick={()=>startRoute(sel)} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'7px',color:'#f7f8f8',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>🗺️ مسیر</button>
        </div>
        {sel.id&&<div style={{marginTop:8}}><button onClick={()=>{
          const stations=getStations();
          const others=stations.filter(s=>s.id!==sel.id&&!s.disabled).slice(0,5);
          setPanel('metro-route');
        }} style={{width:'100%',background:'rgba(139,92,246,.12)',border:'1px solid rgba(139,92,246,.3)',borderRadius:8,padding:'7px',color:'#a78bfa',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>
        🔄 مسیریابی مترو</button></div>}
      </div>}

      {panel==='list'&&<div>
        <h4 style={{fontSize:14,marginBottom:6,color:'#f7f8f8'}}>📍 نقاط من ({pts.length})</h4>
        {pts.length===0?<p style={{color:'#8a8f98',textAlign:'center',fontSize:12}}>نقطه‌ای ذخیره نشده</p>:pts.map((p,i)=>(
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

      {panel==='metro-route'&&sel?.id&&<div>
        <h4 style={{fontSize:14,marginBottom:6}}>🚇 مسیریابی مترو از {sel.name}</h4>
        <p style={{fontSize:12,color:'#8a8f98',marginBottom:8}}>مقصد را انتخاب کنید:</p>
        {getStations().filter(s=>s.id!==sel.id&&!s.disabled).slice(0,20).map(s=>(
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:8,cursor:'pointer'}}
            onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(255,255,255,0.03)'}
            onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}
            onClick={()=>findMetroRoute(sel.id,s.id)}>
            <span style={{width:8,height:8,borderRadius:'50%',background:lineColors[s.lines[0]]||'#71707a',display:'inline-block'}}/>
            <div style={{flex:1}}><b style={{fontSize:13}}>{s.nameFa}</b></div>
            <span style={{fontSize:10,color:'#8a8f98'}}>خط {s.lines.join(',')}</span>
          </div>
        ))}
      </div>}
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
      {CATEGORIES.map(c=>
        <button key={c} type='button' onClick={()=>setCat(c)}
          style={cat===c?{padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'#5e6ad2',border:'none',color:'white',fontWeight:600}:
            {padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',color:'#d0d6e0'}}>
          {ICON[c]} {LABEL[c]}</button>)}
    </div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder='یادداشت (اختیاری)' rows={2} dir="rtl" style={{width:'100%',padding:'9px 12px',marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#f7f8f8',fontSize:13,resize:'none',outline:'none',fontFamily:'Vazirmatn,system-ui'}}/>
    <div style={{display:'flex',gap:6}}>
      <button type='submit' style={{flex:1,background:'#5e6ad2',border:'none',borderRadius:8,padding:'9px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>✅ ذخیره</button>
      <button type='button' onClick={onCancel} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'9px 14px',color:'#d0d6e0',cursor:'pointer',fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>انصراف</button>
    </div>
  </form>;
}
