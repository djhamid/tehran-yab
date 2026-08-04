'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import transit from '@/data/tehran-transit.json';
import {
  Point,ICON,LABEL,CATEGORIES,
  genId,getPoints,savePoint,removePoint,POI_DATABASE
} from '@/lib/storage';

/* ===== CONSTANTS ===== */
const GM_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || 'YOUR_GOOGLE_MAPS_API_KEY'; // Replace with your key
const GM_LIBRARIES: 'places'[] = ['places'];
const TEHRAN_CENTER = {lat:35.6892,lng:51.3890};
const TEHRAN_BOUNDS = {north:35.85,south:35.45,east:51.60,west:51.10};

/* ===== UTILITIES ===== */
const normalize = (s:string) => s.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();

function searchAll(q:string):any[]{
  const t=q.trim(); if(t.length<2) return [];
  const qn=normalize(t); const rv:any[]=[];

  // Transit stations
  for(const line of [...transit.metro,...transit.brt])
    for(const st of line.stations)
      if(normalize(st.name).includes(qn))
        rv.push({name:st.name,lat:st.lat,lng:st.lon,type:'metro',color:line.color,subtitle:line.full_name});

  // POI
  for(const p of POI_DATABASE)
    if(normalize(p.name).includes(qn) || normalize(LABEL[p.category]||'').includes(qn))
      rv.push({name:p.name,lat:p.lat,lng:p.lng,type:'poi',color:'#7170ff',subtitle:LABEL[p.category]});

  // User points
  for(const p of getPoints())
    if(normalize(p.name).includes(qn))
      rv.push({name:p.name,lat:p.lat,lng:p.lng,type:'user',color:'#f59e0b',subtitle:LABEL[p.category]});

  // Dedupe
  const seen=new Set<string>();
  return rv.filter(r=>{const k=r.name+r.lat.toFixed(4);if(seen.has(k))return false;seen.add(k);return true}).slice(0,12);
}

/* ===== STYLES (Linear-inspired) ===== */
const S = {
  full:{width:'100%',height:'100dvh',position:'relative',direction:'ltr',overflow:'hidden'} as any,
  map:{width:'100%',height:'100%'} as any,
  // Top bar
  topBar:{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:100,width:'min(520px,calc(100vw-24px))'} as any,
  topInner:{display:'flex',gap:6,background:'rgba(15,16,17,.92)',backdropFilter:'blur(20px) saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 6px',alignItems:'center',boxShadow:'0 8px 32px rgba(0,0,0,.5)'} as any,
  logo:{fontWeight:700,fontSize:14,whiteSpace:'nowrap',color:'#f7f8f8',padding:'0 4px'} as any,
  searchWrap:{flex:1,position:'relative'} as any,
  input:{width:'100%',padding:'7px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,color:'#f7f8f8',fontSize:13,outline:'none',transition:'all .2s'} as any,
  drop:{position:'absolute',top:'100%',left:0,right:0,background:'#0f1011',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,marginTop:6,padding:4,maxHeight:340,overflowY:'auto',zIndex:110,boxShadow:'0 12px 48px rgba(0,0,0,.5)'} as any,
  dropItem:{padding:'8px 10px',cursor:'pointer',borderRadius:8,display:'flex',alignItems:'center',gap:10,transition:'background .15s'} as any,
  dot:{width:10,height:10,borderRadius:'50%',display:'inline-block',flexShrink:0} as any,
  // Bottom bar (mobile-safe)
  bottomBar:{position:'absolute',bottom:0,left:0,right:0,zIndex:100,display:'flex',justifyContent:'center',padding:'0 12px 12px',pointerEvents:'none'} as any,
  bottomInner:{display:'flex',gap:5,background:'rgba(15,16,17,.92)',backdropFilter:'blur(20px) saturate(1.4)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'5px 8px',boxShadow:'0 8px 32px rgba(0,0,0,.5)',pointerEvents:'auto',flexWrap:'wrap',justifyContent:'center'} as any,
  btn:{padding:'7px 12px',borderRadius:10,fontSize:11.5,fontWeight:500,cursor:'pointer',border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.03)',color:'#f7f8f8',transition:'all .15s',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4,fontFamily:'Vazirmatn,system-ui'} as any,
  btnAct:{padding:'7px 12px',borderRadius:10,fontSize:11.5,fontWeight:600,cursor:'pointer',border:'1px solid var(--accent)',background:'rgba(94,106,210,.15)',color:'#7170ff',transition:'all .15s',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:4,fontFamily:'Vazirmatn,system-ui'} as any,
  // Panel
  panel:{position:'absolute',top:72,right:8,width:320,maxHeight:'calc(100dvh-100px)',background:'rgba(15,16,17,.96)',backdropFilter:'blur(24px)saturate(1.6)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:16,overflowY:'auto',zIndex:100,boxShadow:'0 8px 32px rgba(0,0,0,.4)',display:'flex',flexDirection:'column',gap:4} as any,
  panelItem:{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:10,cursor:'pointer',transition:'background .15s',border:'1px solid transparent'} as any,
};

/* ===== COMPONENT ===== */
export default function TehranMap(){
  const mapRef=useRef<google.maps.Map|null>(null);
  const searchRef=useRef<HTMLInputElement>(null);
  const markersRef=useRef<google.maps.Marker[]>([]);
  const polylineRef=useRef<google.maps.Polyline|null>(null);
  const routeMarkersRef=useRef<google.maps.Marker[]>([]);
  const transitPolylinesRef=useRef<google.maps.Polyline[]>([]);
  const transitDotsRef=useRef<google.maps.Marker[]>([]);
  const poiMarkersRef=useRef<google.maps.Marker[]>([]);

  const [loaded,setLoaded]=useState(false);
  const [pts,setPts]=useState<Point[]>([]);
  const [sq,setSq]=useState('');
  const [sres,setSres]=useState<any[]>([]);
  const [panel,setPanel]=useState<string|null>(null);
  const [sel,setSel]=useState<any>(null);
  const [rmode,setRmode]=useState(false);
  const [rf,setRf]=useState<any>(null);
  const [rr,setRr]=useState<any>(null);
  const [transitVis,setTransitVis]=useState<'both'|'metro'|'brt'|'off'>('both');
  const [showPoi,setShowPoi]=useState(true);

  const flyTo=useCallback((lat:number,lng:number,z:number=16)=>{
    const map=mapRef.current;if(!map)return;
    map.panTo({lat,lng});
    if(map.getZoom()!==z)map.setZoom(z);
  },[]);

  const loadPts=useCallback(()=>setPts(getPoints()),[]);

  // ---- Load Google Maps API ----
  useEffect(()=>{
    if(typeof window==='undefined'||window.google?.maps)return;
    const s=document.createElement('script');
    s.src=`https://maps.googleapis.com/maps/api/js?key=${GM_KEY}&libraries=places&language=fa&region=IR`;
    s.async=true;s.defer=true;
    s.onload=()=>setLoaded(true);
    document.head.appendChild(s);
    return ()=>{s.remove();};
  },[]);

  // ---- Init Map ----
  useEffect(()=>{
    if(!loaded||mapRef.current)return;
    const map=new google.maps.Map(document.getElementById('map-canvas')!,{
      center:TEHRAN_CENTER,zoom:11,minZoom:10,maxZoom:17,
      mapTypeId:'roadmap',
      mapTypeControl:false,
      fullscreenControl:false,
      streetViewControl:false,
      zoomControl:true,
      zoomControlOptions:{position:google.maps.ControlPosition.LEFT_TOP},
      styles:[
        {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
        {featureType:'transit',elementType:'labels',stylers:[{visibility:'off'}]},
        {featureType:'poi.business',stylers:[{visibility:'off'}]},
        {featureType:'road',elementType:'labels',stylers:[{visibility:'on'}]},
        {featureType:'water',stylers:[{color:'#0f172a'}]},
        {featureType:'landscape',stylers:[{color:'#1e293b'}]},
        {featureType:'road',stylers:[{color:'#334155'}]},
        {featureType:'road.highway',stylers:[{color:'#475569'}]},
        {featureType:'administrative',elementType:'labels.text.fill',stylers:[{color:'#94a3b8'}]},
        {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#cbd5e1'}]},
      ],
      restriction:{latLngBounds:TEHRAN_BOUNDS,strictBounds:false},
    });
    mapRef.current=map;
    setLoaded(true);
    loadPts();

    // Listen for search box
    const input=searchRef.current;
    if(input&&window.google?.maps?.places){
      const autocomplete=new google.maps.places.Autocomplete(input,{
        types:['establishment','geocode'],
        componentRestrictions:{country:'IR'},
        fields:['name','geometry','formatted_address'],
      });
      autocomplete.bindTo('bounds',map);
      autocomplete.addListener('place_changed',()=>{
        const place=autocomplete.getPlace();
        if(place.geometry?.location){
          map.setCenter(place.geometry.location);
          map.setZoom(16);
        }
      });
    }

    return ()=>{mapRef.current=null;};
  },[loaded]);

  // ---- User & POI Markers ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    markersRef.current.forEach(m=>m.setMap(null));markersRef.current=[];
    poiMarkersRef.current.forEach(m=>m.setMap(null));poiMarkersRef.current=[];

    // POI markers
    if(showPoi) POI_DATABASE.forEach(p=>{
      const m=new google.maps.Marker({
        position:{lat:p.lat,lng:p.lng},map,
        icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:'#7170ff',fillOpacity:0.7,strokeColor:'#fff',strokeWeight:1.5},
        title:p.name,
      });
      m.addListener('click',()=>{
        setSel({name:p.name,lat:p.lat,lng:p.lng,type:'poi',subtitle:LABEL[p.category]});
        setPanel(null);
      });
      poiMarkersRef.current.push(m);
    });

    // User markers
    pts.forEach(p=>{
      const colors:any={metro:'#E31837',brt:'#1E88E5',university:'#8b5cf6',school:'#f59e0b',home:'#22c55e',cafe:'#d97706',restaurant:'#ef4444',shop:'#ec4899',hospital:'#e11d48',park:'#16a34a',gym:'#ea580c',library:'#6366f1',other:'#64748b'};
      const m=new google.maps.Marker({
        position:{lat:p.lat,lng:p.lng},map,
        label:{text:ICON[p.category]||'📍',fontSize:'16px'},
        icon:{path:google.maps.SymbolPath.CIRCLE,scale:14,fillColor:colors[p.category]||'#3b82f6',fillOpacity:1,strokeColor:'#fff',strokeWeight:2.5},
        title:p.name,
        optimized:false,
      });
      const info=new google.maps.InfoWindow({
        content:`<div style="font-family:Vazirmatn,system-ui;direction:rtl;padding:4px"><b>${p.name}</b><br/><span style="color:#94a3b8;font-size:13px">${ICON[p.category]} ${LABEL[p.category]||'سایر'}</span></div>`,
        pixelOffset:new google.maps.Size(0,-4),
      });
      m.addListener('click',()=>info.open(map,m));
      markersRef.current.push(m);
    });
  },[pts,showPoi]);

  // ---- Transit Layers ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    transitPolylinesRef.current.forEach(p=>p.setMap(null));transitPolylinesRef.current=[];
    transitDotsRef.current.forEach(m=>m.setMap(null));transitDotsRef.current=[];

    if(transitVis==='off')return;
    const isM=transitVis==='both'||transitVis==='metro';
    const isB=transitVis==='both'||transitVis==='brt';

    [...(isM?transit.metro:[]),...(isB?transit.brt:[])].forEach(line=>{
      const pts=line.stations.map((s:any)=>({lat:s.lat,lng:s.lon}));
      const poly=new google.maps.Polyline({
        path:pts,map,strokeColor:line.color,strokeWeight:3,strokeOpacity:0.8,
        geodesic:true,
      });
      transitPolylinesRef.current.push(poly);
      line.stations.forEach((st:any)=>{
        const dot=new google.maps.Marker({
          position:{lat:st.lat,lng:st.lon},map,
          icon:{path:google.maps.SymbolPath.CIRCLE,scale:5,fillColor:line.color,fillOpacity:1,strokeColor:'#fff',strokeWeight:1.5},
          title:st.name,
        });
        dot.addListener('click',()=>{
          setSel({name:st.name,lat:st.lat,lng:st.lon,type:'metro',color:line.color,subtitle:line.full_name});
          setPanel(null);
        });
        transitDotsRef.current.push(dot);
      });
    });
  },[transitVis]);

  // ---- Routing ----
  const getRoute=async (f:any,t:any)=>{
    try{
      const r=await fetch(
        `https://router.project-osrm.org/route/v1/driving/${f.lng},${f.lat};${t.lng},${t.lat}?overview=full&geometries=geojson&alternatives=true`,
        {signal:AbortSignal.timeout(10000)}
      );
      const d=await r.json();
      if(d.code==='Ok'&&d.routes?.length>0) return d.routes[0];
    }catch{}
    return null;
  };

  const startRoute=(p:any)=>{
    clearRoute();
    const map=mapRef.current;if(!map)return;
    const m=new google.maps.Marker({
      position:{lat:p.lat,lng:p.lng},map,
      icon:{path:google.maps.SymbolPath.CIRCLE,scale:8,fillColor:'#22c55e',fillOpacity:1,strokeColor:'#fff',strokeWeight:2.5},
      title:'مبدأ',
    });
    routeMarkersRef.current.push(m);
    setRf(p);setRmode(true);setSel(null);
  };

  const clearRoute=()=>{
    routeMarkersRef.current.forEach(m=>m.setMap(null));routeMarkersRef.current=[];
    polylineRef.current?.setMap(null);polylineRef.current=null;
    setRr(null);setRf(null);setRmode(false);
  };

  // ---- Map Click Handler ----
  useEffect(()=>{
    const map=mapRef.current;if(!map||!rmode)return;
    const handler=(e:google.maps.MapMouseEvent)=>{
      if(!e.latLng||!rmode)return;
      const p={name:'موقعیت کلیک',lat:e.latLng.lat(),lng:e.latLng.lng(),type:'user',color:'#ef4444'};
      if(!rf){
        startRoute(p);
      }
    };
    const unsub=map.addListener('click',handler);
    return ()=>{google.maps.event.removeListener(unsub);};
  },[rmode,rf]);

  // ---- Add point ----
  const addP=(n:string,cat:Point['category'],note:string)=>{
    const c=mapRef.current?.getCenter();if(!c)return;
    savePoint({id:genId(),name:n,lat:c.lat(),lng:c.lng(),category:cat,createdAt:new Date().toISOString(),note:note||undefined});
    setPts(getPoints());setPanel(null);
  };

  // ---- Search ----
  const handleSearch=(v:string)=>{setSq(v);setSres(searchAll(v));};
  const selectSearch=(r:any)=>{setSq(r.name);setSres([]);setSel(r);flyTo(r.lat,r.lng);};

  // ---- Render ----
  if(!loaded) return <div style={{width:'100%',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#08090a',color:'#7170ff',flexDirection:'column',gap:12}}>
    <div style={{fontSize:48}}>🗺️</div>
    <div style={{fontSize:20,fontWeight:700}}>TehranYab</div>
    <div style={{fontSize:13,color:'#8a8f98'}}>در حال بارگذاری نقشه...</div>
  </div>;

  return <div style={S.full}>
    <div id="map-canvas" style={S.map}/>

    {/* Top Bar */}
    <div style={S.topBar}>
      <div style={S.topInner}>
        <span style={S.logo}><span style={{color:'#7170ff'}}>تهران</span>یاب</span>
        <div style={S.searchWrap}>
          <input ref={searchRef} value={sq} onChange={e=>handleSearch(e.target.value)}
            placeholder='جستجوی مکان، دانشگاه، مترو...' dir="rtl" style={S.input}
            onFocus={e=>e.target.style.borderColor='rgba(113,112,255,.4)'}
            onBlur={e=>{e.target.style.borderColor='rgba(255,255,255,0.06)';setTimeout(()=>setSres([]),300)}}/>
          {sres.length>0&&<div style={S.drop}>
            {sres.map((r,i)=>(
              <div key={i} onClick={()=>selectSearch(r)} style={S.dropItem}
                onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(113,112,255,.1)'}
                onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}>
                <span style={{...S.dot,background:r.color||'#7170ff'}}/>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                  <div style={{fontSize:11,color:'#8a8f98',display:'flex',gap:4}}>
                    <span>{r.type==='metro'?'🚇':r.type==='poi'?'📍':'⭐'}</span><span>{r.subtitle||''}</span>
                  </div>
                </div>
                <span style={{fontSize:10,color:'#8a8f98',background:'rgba(255,255,255,0.04)',borderRadius:6,padding:'2px 6px'}}>
                  {r.type==='metro'?'مترو':r.type==='poi'?'مکان':'من'}</span>
              </div>
            ))}
          </div>}
        </div>
      </div>
    </div>

    {/* Bottom Bar */}
    <div style={S.bottomBar}>
      <div style={S.bottomInner}>
        <button onClick={()=>setPanel('list')} style={panel==='list'?S.btnAct:S.btn}>📍 {pts.length}</button>
        <button onClick={()=>setPanel('add')} style={panel==='add'?S.btnAct:S.btn}>➕ جدید</button>
        <button onClick={()=>{
          clearRoute();
          const map=mapRef.current;if(!map)return;
          setRmode(true);
          map.addListener('click',async (e:google.maps.MapMouseEvent)=>{
            if(!e.latLng||!rmode)return;
            if(!rf){
              const p={name:'مبدأ',lat:e.latLng.lat(),lng:e.latLng.lng(),type:'user',color:'#22c55e'};
              startRoute(p);
            }else{
              const p={name:'مقصد',lat:e.latLng.lat(),lng:e.latLng.lng(),type:'user',color:'#ef4444'};
              const r=await getRoute(rf,p);
              if(r){
                const coords=r.geometry.coordinates.map((c:any)=>({lat:c[1],lng:c[0]}));
                const poly=new google.maps.Polyline({path:coords,map:mapRef.current!,strokeColor:'#7170ff',strokeWeight:4,strokeOpacity:0.9});
                polylineRef.current=poly;
                mapRef.current!.fitBounds(coords.reduce((b:any,c:any)=>{b.extend(c);return b;},new google.maps.LatLngBounds()),50);
                setRr({d:r.distance/1000,t:r.duration/60,route:r});
              }
              setRmode(false);
            }
          });
        }} style={rmode?S.btnAct:S.btn}>🗺️ مسیر</button>
        <button onClick={()=>{
          const m=['both','metro','brt','off'];const i=m.indexOf(transitVis);
          setTransitVis(m[(i+1)%4] as any);
        }} style={{...S.btn,borderColor:transitVis!=='off'?'rgba(139,92,246,.5)':'rgba(255,255,255,0.06)',color:transitVis!=='off'?'#a78bfa':'#f7f8f8'}}>
          🚇 {transitVis==='both'?'همه':transitVis==='metro'?'مترو':transitVis==='brt'?'BRT':'مخفی'}</button>
        <button onClick={()=>setShowPoi(!showPoi)} style={{...S.btn,borderColor:showPoi?'rgba(34,197,94,.5)':'rgba(255,255,255,0.06)',color:showPoi?'#4ade80':'#f7f8f8'}}>
          🏛️ مکان‌ها</button>
        <button onClick={()=>{clearRoute();setPanel(null);setSel(null);}} style={S.btn}>✕ پاک</button>
      </div>
    </div>

    {/* Panel */}
    {(panel||sel||rr||rmode)&&<div style={S.panel}>
      {rmode&&<div style={{padding:10,background:'rgba(255,255,255,0.03)',borderRadius:10,border:'1px solid rgba(255,255,255,0.06)'}}>
        <p style={{margin:'0 0 6px',fontSize:12,color:'#f59e0b'}}>{rf?'📍 مقصد را کلیک کنید':'📍 مبدأ را کلیک کنید'}</p>
        <button onClick={clearRoute}
          style={{width:'100%',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'6px 12px',color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>
          ❌ لغو مسیریابی</button>
      </div>}

      {rr&&<div style={{padding:12,background:'rgba(113,112,255,.08)',borderRadius:12,border:'1px solid rgba(113,112,255,.2)'}}>
        <h4 style={{margin:'0 0 8px',color:'#7170ff',fontSize:14}}>🗺️ مسیریابی</h4>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
            <div style={{fontSize:11,color:'#8a8f98'}}>فاصله</div>
            <div style={{fontWeight:700,fontSize:18,color:'#7170ff'}}>{rr.d.toFixed(1)} کیلومتر</div>
          </div>
          <div style={{padding:'8px 12px',background:'rgba(255,255,255,0.03)',borderRadius:8}}>
            <div style={{fontSize:11,color:'#8a8f98'}}>زمان تخمینی</div>
            <div style={{fontWeight:700,fontSize:18,color:'#22c55e'}}>~{rr.t.toFixed(0)} دقیقه</div>
          </div>
        </div>
        <button onClick={clearRoute}
          style={{width:'100%',marginTop:8,background:'transparent',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'6px',color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>
          ❌ پاک کردن مسیر</button>
      </div>}

      {sel&&<div style={{padding:10,background:'rgba(255,255,255,0.02)',borderRadius:10}}>
        <h4 style={{margin:'0 0 2px',fontSize:14}}>{sel.type==='metro'?'🚇':sel.type==='poi'?'📍':'⭐'} {sel.name}</h4>
        <p style={{margin:'0 0 8px',fontSize:12,color:'#8a8f98'}}>{sel.subtitle||''}</p>
        <div style={{display:'flex',gap:6}}>
          <button onClick={()=>flyTo(sel.lat,sel.lng,16)} style={{flex:1,background:'var(--accent)',border:'none',borderRadius:8,padding:'7px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>📍 نمایش</button>
          <button onClick={()=>startRoute(sel)} style={{flex:1,background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'7px',color:'#f7f8f8',cursor:'pointer',fontSize:12,fontFamily:'Vazirmatn,system-ui'}}>🗺️ مسیریابی</button>
        </div>
      </div>}

      {panel==='list'&&<div>
        <h4 style={{fontSize:14,marginBottom:6}}>📍 نقاط من ({pts.length})</h4>
        {pts.length===0?<p style={{color:'#8a8f98',textAlign:'center',fontSize:12}}>نقطه‌ای ذخیره نشده</p>:pts.map(p=>(
          <div key={p.id} style={S.panelItem} onMouseEnter={e=>(e.target as HTMLElement).style.background='rgba(255,255,255,0.03)'}
            onMouseLeave={e=>(e.target as HTMLElement).style.background='transparent'}>
            <span style={{fontSize:16}}>{ICON[p.category]||'📍'}</span>
            <div style={{flex:1}}><b style={{fontSize:13}}>{p.name}</b><br/><span style={{fontSize:11,color:'#8a8f98'}}>{LABEL[p.category]||'سایر'}</span></div>
            <button onClick={()=>flyTo(p.lat,p.lng,16)}
              style={{background:'transparent',border:'none',color:'#7170ff',cursor:'pointer',fontSize:14,padding:2}}>📍</button>
            <button onClick={()=>{removePoint(p.id);setPts(getPoints());}}
              style={{background:'transparent',border:'none',color:'#ef4444',cursor:'pointer',fontSize:16,padding:2}}>×</button>
          </div>
        ))}</div>}

      {panel==='add'&&<AddForm onSubmit={addP} onCancel={()=>setPanel(null)}/>}
    </div>}
  </div>;
}

/* ===== ADD FORM ===== */
function AddForm({onSubmit,onCancel}:{onSubmit:(n:string,c:Point['category'],no:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState('');const [cat,setCat]=useState<Point['category']>('other');const [note,setNote]=useState('');
  return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSubmit(name.trim(),cat,note.trim());}}>
    <h4 style={{fontSize:14,marginBottom:2}}>➕ نقطه جدید</h4>
    <p style={{fontSize:11.5,color:'#8a8f98',marginBottom:8}}>موقعیت فعلی مرکز نقشه ذخیره می‌شه.</p>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder='مثلاً: دانشگاه فرهنگیان مفتح' dir="rtl"
      style={{width:'100%',padding:'9px 12px',marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#f7f8f8',fontSize:13,outline:'none'}}/>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginBottom:8}}>
      {CATEGORIES.map(c=>(
        <button key={c} type='button' onClick={()=>setCat(c)}
          style={cat===c?{padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'var(--accent)',border:'none',color:'white',fontWeight:600}:
            {padding:'7px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',color:'#d0d6e0'}}>
          {ICON[c]} {LABEL[c]}</button>
      ))}
    </div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder='یادداشت (اختیاری)' rows={2} dir="rtl"
      style={{width:'100%',padding:'9px 12px',marginBottom:8,background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,color:'#f7f8f8',fontSize:13,resize:'none',outline:'none'}}/>
    <div style={{display:'flex',gap:6}}>
      <button type='submit' style={{flex:1,background:'var(--accent)',border:'none',borderRadius:8,padding:'9px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>✅ ذخیره</button>
      <button type='button' onClick={onCancel} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'9px 14px',color:'#d0d6e0',cursor:'pointer',fontSize:13,fontFamily:'Vazirmatn,system-ui'}}>انصراف</button>
    </div>
  </form>;
}
