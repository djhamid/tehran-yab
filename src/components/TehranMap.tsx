'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import transit from '@/data/tehran-transit.json';
import {
  Point,ICON,LABEL,CATEGORIES,
  genId,getPoints,savePoint,removePoint,POI_DATABASE
} from '@/lib/storage';

// ================ CONSTANTS ================
const COLORS = {
  bg:'rgba(11,17,32,.92)',
  surface:'#1a2332',
  surface2:'#243044',
  border:'#2d3b4f',
  accent:'#3b82f6',
  accent2:'#8b5cf6',
  success:'#22c55e',
  danger:'#ef4444',
  warning:'#f59e0b',
  text:'#f1f5f9',
  muted:'#64748b',
};

// ================ UTILITY ================
function normalize(s:string){return s.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();}

function haversine(lat1:number,lon1:number,lat2:number,lon2:number):number{
  const R=6371;const dLat=(lat2-lat1)*Math.PI/180;const dLon=(lon2-lon1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ================ SEARCH ================
interface SearchResult {
  name:string;lat:number;lng:number;
  type:string; // 'metro'|'brt'|'poi'|'user'
  subtitle?:string;color?:string;ref?:string;
}

function searchAll(q:string):SearchResult[]{
  const t=q.trim();
  if(t.length<2)return[];
  const qn=normalize(t);
  const rv:SearchResult[]=[];

  // Search transit stations (metro + brt)
  for(const line of transit.metro.concat(transit.brt)){
    for(const st of line.stations){
      if(normalize(st.name).includes(qn)){
        rv.push({
          name:st.name,lat:st.lat,lng:st.lon,
          type:'metro',color:line.color,
          subtitle:line.full_name
        });
      }
    }
  }

  // Search POI database
  for(const p of POI_DATABASE){
    if(normalize(p.name).includes(qn) || normalize(ICON[p.category]).includes(qn)){
      rv.push({
        name:p.name,lat:p.lat,lng:p.lng,
        type:'poi',color:COLORS.accent,
        subtitle:LABEL[p.category]
      });
    }
  }

  // Search user points
  const userPts=getPoints();
  for(const p of userPts){
    if(normalize(p.name).includes(qn) || normalize(ICON[p.category]).includes(qn)){
      rv.push({
        name:p.name,lat:p.lat,lng:p.lng,
        type:'user',color:'#f59e0b',
        subtitle:LABEL[p.category]
      });
    }
  }

  // Deduplicate by name+lat
  const seen=new Set<string>();
  return rv.filter(r=>{
    const k=r.name+r.lat.toFixed(4);
    if(seen.has(k))return false;
    seen.add(k);return true;
  }).slice(0,12);
}

// ================ ROUTING ================
async function getRoute(f:[number,number],t:[number,number]){
  try{
    const r=await fetch(
      `https://router.project-osrm.org/route/v1/driving/${f[0]},${f[1]};${t[0]},${t[1]}?overview=full&geometries=geojson&steps=true&alternatives=true`,
      {signal:AbortSignal.timeout(10000)}
    );
    const d=await r.json();
    if(d.code==='Ok'&&d.routes?.length>0)return d.routes[0];
  }catch{}
  return null;
}

// ================ COMPONENT ================
export default function TehranMap(){
  const mc=useRef<HTMLDivElement>(null);
  const mapRef=useRef<maplibregl.Map|null>(null);
  const markers=useRef<maplibregl.Marker[]>([]);
  const routeLines=useRef<string[]>([]);
  const routeMarkers=useRef<maplibregl.Marker[]>([]);
  const transitLayers=useRef<{[k:string]:{layer:string,source:string,stations:string[]}}>({});
  const poiMarkers=useRef<maplibregl.Marker[]>([]);

  const [pts,setPts]=useState<Point[]>([]);
  const [sel,setSel]=useState<SearchResult|null>(null);
  const [panel,setPanel]=useState<string|null>(null);
  const [rmode,setRmode]=useState(false);
  const [rf,setRf]=useState<SearchResult|null>(null);
  const [rr,setRr]=useState<{d:number;t:number;route:any}|null>(null);
  const [transitVis,setTransitVis]=useState<'metro'|'brt'|'both'|'off'>('both');
  const [showPoi,setShowPoi]=useState(true);
  const [sq,setSq]=useState('');
  const [sres,setSres]=useState<SearchResult[]>([]);

  const clearRoute=useCallback(()=>{
    const m=mapRef.current;if(!m)return;
    routeLines.current.forEach(id=>{try{m.removeLayer(id);m.removeSource(id);}catch{}});
    routeLines.current=[];
    routeMarkers.current.forEach(x=>x.remove());
    routeMarkers.current=[];
    setRr(null);setRf(null);setRmode(false);
  },[]);

  const flyTo=useCallback((lat:number,lng:number,zoom:number=15)=>{
    mapRef.current?.flyTo({center:[lng,lat],zoom,duration:600});
  },[]);

  const load=useCallback(()=>setPts(getPoints()),[]);

  // ---- MAP INIT ----
  useEffect(()=>{
    if(!mc.current||mapRef.current)return;
    const map=new maplibregl.Map({
      container:mc.current,
      style:{
        version:8,name:'TehranYab',
        sources:{t:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],tileSize:256,attribution:'© CARTO'}},
        layers:[{id:'base',type:'raster',source:'t'}]
      },
      center:[51.389,35.6892],zoom:11
    });
    map.addControl(new maplibregl.NavigationControl({showZoom:true,showCompass:false}),'top-left');
    map.on('load',()=>{mapRef.current=map;load();setTimeout(()=>map.resize(),200);});
    return ()=>{map.remove();mapRef.current=null;};
  },[]);

  // ---- POI & USER MARKERS ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    markers.current.forEach(x=>x.remove());markers.current=[];
    poiMarkers.current.forEach(x=>x.remove());poiMarkers.current=[];

    // POI markers
    if(showPoi){
      const bounds=map.getBounds();
      POI_DATABASE.forEach(p=>{
        if(!bounds.contains([p.lng,p.lat]))return;
        const el=document.createElement('div');
        el.style.cssText=`width:28px;height:28px;background:rgba(59,130,246,.15);border:2px solid rgba(59,130,246,.5);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;cursor:pointer;backdrop-filter:blur(2px)`;
        el.textContent=ICON[p.category]||'📍';
        el.title=p.name;
        el.onclick=()=>{
          setSel({name:p.name,lat:p.lat,lng:p.lng,type:'poi',subtitle:LABEL[p.category],color:COLORS.accent});
          setPanel(null);
        };
        const pop=new maplibregl.Popup({offset:20,closeButton:true})
          .setHTML(`<div style="font-family:Vazirmatn,system-ui"><b>${p.name}</b><br/><small>${ICON[p.category]} ${LABEL[p.category]}</small></div>`);
        poiMarkers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map));
      });
    }

    // User markers
    pts.forEach(p=>{
      const el=document.createElement('div');
      const colors:{[k:string]:string}={metro:'#E31837',brt:'#1E88E5',university:'#8b5cf6',school:'#f59e0b',home:'#22c55e',cafe:'#d97706',restaurant:'#ef4444',shop:'#ec4899',hospital:'#e11d48',park:'#16a34a',gym:'#ea580c',library:'#6366f1',other:'#64748b'};
      const bg=colors[p.category]||'#3b82f6';
      el.style.cssText=`width:34px;height:34px;background:${bg};border:3px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.3)`;
      el.textContent=ICON[p.category]||'📍';
      const pop=new maplibregl.Popup({offset:25,closeButton:true})
        .setHTML(`<div style="font-family:Vazirmatn,system-ui"><b>${p.name}</b><br/><small>${ICON[p.category]} ${LABEL[p.category]||'سایر'}</small>${p.note?`<br/><span style="font-size:12px;color:#94a3b8">${p.note}</span>`:''}</div>`);
      markers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map));
    });
  },[pts,showPoi]);

  // ---- TRANSIT LAYERS ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const isMetro=transitVis==='metro'||transitVis==='both';
    const isBrt=transitVis==='brt'||transitVis==='both';
    const all=[...transit.metro.filter(()=>isMetro),...transit.brt.filter(()=>isBrt)];

    all.forEach((line,i)=>{
      const lid='tl'+i;const sid='ts'+i;
      const coords=line.stations.map((s:any)=>[s.lon,s.lat]);
      if(map.getSource(sid)){
        try{map.setLayoutProperty(lid,'visibility','visible');}catch{}
        return;
      }
      map.addSource(sid,{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({id:lid,type:'line',source:sid,paint:{'line-color':line.color,'line-width':4,'line-opacity':0.85,'line-blur':1}});
      // Station dots
      coords.forEach((c:number[],j:number)=>{
        const stid=lid+'_st'+j;const snid=lid+'_sn'+j;
        map.addSource(stid,{type:'geojson',data:{type:'Feature',properties:{name:line.stations[j].name,line:line.name,color:line.color},geometry:{type:'Point',coordinates:c}}});
        map.addLayer({id:snid,type:'circle',source:stid,paint:{'circle-radius':6,'circle-color':line.color,'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-stroke-opacity':0.9}});
        map.on('click',snid,(e:any)=>{
          if(e.features?.[0]){
            const p=e.features[0].properties;
            setSel({name:p.name,lat:c[1],lng:c[0],type:'metro',color:p.color,subtitle:p.line});
            setPanel(null);
          }
        });
      });
    });

    // Hide disabled layers
    [transit.metro,transit.brt].forEach((lines,idx)=>{
      const visible=idx===0?isMetro:isBrt;
      lines.forEach((_:any,i:number)=>{
        const baseIdx=idx===0?i:i+transit.metro.length;
        try{map.setLayoutProperty('tl'+baseIdx,'visibility',visible?'visible':'none');}catch{}
      });
    });
  },[transitVis]);

  // ---- CLICK HANDLER (ROUTING) ----
  useEffect(()=>{
    const map=mapRef.current;if(!map)return;
    const handler=async (e:any)=>{
      if(!rmode)return;
      const p:SearchResult={name:'موقعیت کلیک',lat:e.lngLat.lat,lng:e.lngLat.lng,type:'user',color:COLORS.danger,subtitle:'مبدأ/مقصد'};
      if(!rf){
        setRf(p);
        const el=document.createElement('div');
        el.style.cssText='width:16px;height:16px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer';
        routeMarkers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
      }else{
        const r=await getRoute([rf.lng,rf.lat],[p.lng,p.lat]);
        if(r){
          setRr({d:r.distance/1000,t:r.duration/60,route:r});
          const sid='rt_'+genId();
          if(map.getSource(sid))(map.getSource(sid) as maplibregl.GeoJSONSource).setData(r.geometry);
          else{
            map.addSource(sid,{type:'geojson',data:r.geometry});
            map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#3b82f6','line-width':5,'line-opacity':0.9,'line-blur':1}});
            // Distance markers at start and end
            map.addLayer({id:sid+'_glow',type:'line',source:sid,paint:{'line-color':'#3b82f6','line-width':10,'line-opacity':0.2}});
            // Reorder
            try{
              const layers=map.getStyle().layers||[];
              const baseIdx=layers.findIndex(l=>l.id==='base');
              if(baseIdx>=0){map.moveLayer(sid,layers[baseIdx+1].id);map.moveLayer(sid+'_glow',layers[baseIdx+1].id);}
            }catch{}
          }
          routeLines.current.push(sid,sid+'_glow');
          const b=new maplibregl.LngLatBounds();r.geometry.coordinates.forEach((c:[number,number])=>b.extend(c));
          map.fitBounds(b,{padding:80,maxZoom:15});
        }
        setRmode(false);
      }
    };
    map.on('click',handler);
    return ()=>{map.off('click',handler);};
  },[rmode,rf]);

  // ---- HANDLERS ----
  const startRoute=(p:SearchResult)=>{
    clearRoute();
    const map=mapRef.current;if(!map)return;
    setRf(p);
    setRmode(true);
    setSel(null);
    const el=document.createElement('div');
    el.style.cssText='width:16px;height:16px;background:#22c55e;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.4);cursor:pointer';
    routeMarkers.current.push(new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map));
  };

  const handleSearch=(v:string)=>{setSq(v);setSres(v.length>=2?searchAll(v):[]);};
  const selectSearch=(r:SearchResult)=>{setSq(r.name);setSres([]);setSel(r);setPanel(r.type==='metro'?'transit':null);flyTo(r.lat,r.lng);};

  const addP=(n:string,cat:Point['category'],note:string)=>{
    const c=mapRef.current?.getCenter();if(!c)return;
    savePoint({id:genId(),name:n,lat:c.lat,lng:c.lng,category:cat,createdAt:new Date().toISOString(),note:note||undefined});
    setPts(getPoints());setPanel(null);
  };

  const showAllPoi=()=>{
    const div=document.createElement('div');
    div.style.cssText=`position:fixed;top:0;left:0;right:0;bottom:0;z-index:1000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center`;
    div.onclick=(e)=>{if(e.target===div)div.remove();};
    const inner=document.createElement('div');
    inner.style.cssText=`background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:20px;padding:24px;maxWidth:450px;width:90vw;maxHeight:80vh;overflow-y:auto;direction:rtl`;
    inner.innerHTML=`<h3 style="margin:0 0 8px;color:${COLORS.accent}">📍 نقاط کاربر (${pts.length})</h3>
      ${pts.length===0?'<p style="color:#64748b;textAlign:center;fontSize:13px">نقطه‌ای ذخیره نشده</p>':pts.map(p=>`<div style="display:flex;alignItems:center;gap:8px;padding:8px 0;borderBottom:1px solid ${COLORS.border}">
        <span style="fontSize:16px">${ICON[p.category]||'📍'}</span><div style="flex:1"><b>${p.name}</b><br/><small style="color:${COLORS.muted}">${LABEL[p.category]||'سایر'}</small></div>
        <span onclick="(function(){const el=document.querySelector('[data-p="${p.id}"]');if(el)el.remove();window._removePoint&&window._removePoint('${p.id}')})()" style="color:${COLORS.danger};cursor:pointer;fontSize:18px;padding:4px">×</span>
      </div>`).join('')}`;
    div.appendChild(inner);document.body.appendChild(div);
  };

  // ================ RENDER ================
  const sty={
    full:{width:'100%',height:'100vh',position:'relative',direction:'ltr'} as any,
    topBar:{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:10,width:500,maxWidth:'92vw'} as any,
    barInner:{display:'flex',gap:8,background:COLORS.bg,backdropFilter:'blur(16px)',border:`1px solid ${COLORS.border}`,borderRadius:16,padding:'6px 8px',alignItems:'center',boxShadow:'0 4px 24px rgba(0,0,0,.3)'} as any,
    logo:{fontWeight:700,fontSize:16,whiteSpace:'nowrap',marginLeft:4} as any,
    searchWrap:{flex:1,position:'relative'} as any,
    input:{width:'100%',padding:'7px 14px',background:COLORS.surface,border:`1px solid ${COLORS.border}`,borderRadius:10,color:COLORS.text,fontSize:13,outline:'none',transition:'border .15s'} as any,
    dropdown:{position:'absolute',top:'100%',left:0,right:0,background:COLORS.surface,border:`1px solid ${COLORS.border}`,borderRadius:12,marginTop:6,maxHeight:320,overflowY:'auto',zIndex:30,boxShadow:'0 8px 32px rgba(0,0,0,.4)'} as any,
    ddItem:{padding:'10px 12px',cursor:'pointer',borderBottom:`1px solid ${COLORS.border}`,display:'flex',alignItems:'center',gap:10,transition:'background .15s'} as any,
    dot:{width:10,height:10,borderRadius:'50%',display:'inline-block',flexShrink:0} as any,
    btns:{position:'absolute',bottom:20,left:'50%',transform:'translateX(-50%)',display:'flex',gap:6,zIndex:10} as any,
    btn:{background:COLORS.bg,backdropFilter:'blur(16px)',border:`1px solid ${COLORS.border}`,borderRadius:12,padding:'9px 16px',color:COLORS.text,cursor:'pointer',fontWeight:500,fontSize:12,transition:'all .15s',whiteSpace:'nowrap'} as any,
    btnActive:{background:'rgba(59,130,246,.2)',border:`1px solid ${COLORS.accent}`,color:COLORS.accent,borderRadius:12,padding:'9px 16px',cursor:'pointer',fontWeight:600,fontSize:12,whiteSpace:'nowrap'} as any,
    panel:{position:'absolute',top:80,right:12,width:320,maxHeight:'calc(100%-140px)',background:COLORS.bg,backdropFilter:'blur(20px)',border:`1px solid ${COLORS.border}`,borderRadius:20,padding:20,overflowY:'auto',zIndex:20,boxShadow:'0 8px 32px rgba(0,0,0,.3)'} as any,
    panelItem:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',marginBottom:6,border:`1px solid ${COLORS.border}`,borderRadius:12,transition:'all .15s',cursor:'pointer'} as any,
    catGrid:{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:12} as any,
    catBtn:(active:boolean)=>active?{padding:'6px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:COLORS.accent,border:'none',color:'white',fontWeight:600}:{padding:'6px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,background:COLORS.surface,border:`1px solid ${COLORS.border}`,color:COLORS.muted} as any,
  };

  return (
    <div style={sty.full}>
      <div ref={mc} style={{width:'100%',height:'100%'}}/>

      {/* TOP BAR */}
      <div style={sty.topBar}>
        <div style={sty.barInner}>
          <span style={sty.logo}><span style={{color:COLORS.accent}}>تهران</span>یاب</span>
          <div style={sty.searchWrap}>
            <input value={sq} onChange={e=>handleSearch(e.target.value)}
              placeholder='🔍 جستجوی هر چیزی... مترو، دانشگاه، کافه، بیمارستان'
              dir='rtl' style={sty.input}/>
            {sres.length>0&&<div style={sty.dropdown}>
              {sres.map((r,i)=>(
                <div key={i} onClick={()=>selectSearch(r)} style={sty.ddItem}
                  onMouseEnter={e=>{(e.target as HTMLElement).style.background='rgba(59,130,246,.1)'}}
                  onMouseLeave={e=>{(e.target as HTMLElement).style.background='transparent'}}>
                  <span style={{...sty.dot,background:r.color||COLORS.accent}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:13}}>{r.name}</div>
                    <div style={{fontSize:11,color:COLORS.muted,display:'flex',gap:4}}>
                      <span>{r.type==='metro'?'🚇':r.type==='poi'?'📍':r.type==='user'?'⭐':'📍'}</span>
                      <span>{r.subtitle||''}</span>
                    </div>
                  </div>
                  <span style={{fontSize:10,color:COLORS.muted,background:COLORS.surface2,borderRadius:6,padding:'2px 6px'}}>
                    {r.type==='metro'?'مترو':r.type==='poi'?'مکان':r.type==='user'?'من':''}
                  </span>
                </div>
              ))}
            </div>}
          </div>
        </div>
      </div>

      {/* FLOATING BUTTONS */}
      <div style={sty.btns}>
        <button onClick={()=>setPanel('list')} style={panel==='list'?sty.btnActive:sty.btn}>
          📍 نقاط ({pts.length})</button>
        <button onClick={()=>setPanel('add')} style={panel==='add'?sty.btnActive:sty.btn}>
          ➕ جدید</button>
        <button onClick={()=>{clearRoute();setRmode(true);}} style={rmode?sty.btnActive:sty.btn}>
          🗺️ مسیر</button>
        <button onClick={()=>{
          const modes=['both','metro','brt','off']as const;
          const idx=modes.indexOf(transitVis);
          setTransitVis(modes[(idx+1)%4]);setPanel('transit');
        }} style={{...sty.btn,borderColor:transitVis!=='off'?'#8b5cf6':COLORS.border,color:transitVis!=='off'?'#a78bfa':COLORS.text,fontWeight:transitVis!=='off'?600:500}}>
          🚇 {transitVis==='both'?'همه':transitVis==='metro'?'مترو':transitVis==='brt'?'بی‌آر‌تی':'مخفی'}</button>
        <button onClick={()=>{setShowPoi(!showPoi);}} style={{...sty.btn,borderColor:showPoi?'#22c55e':COLORS.border,color:showPoi?'#4ade80':COLORS.text}}>
          🏛️ مکان‌ها</button>
      </div>

      {/* SIDE PANEL */}
      {(panel||sel||rr||rmode)&&(
        <div style={sty.panel}>
          {/* Routing mode indicator */}
          {rmode&&<div style={{marginBottom:12,padding:12,border:`1px solid ${COLORS.border}`,borderRadius:12,background:COLORS.surface}}>
            <p style={{margin:'0 0 8px',fontSize:13,color:COLORS.warning}}>
              {rf?'📍 مقصد را روی نقشه کلیک کنید':'📍 مبدأ را روی نقشه کلیک کنید'}
            </p>
            <div style={{display:'flex',gap:8}}>
              {rf&&<button onClick={()=>{clearRoute();setRmode(true);}}
                style={{flex:1,background:COLORS.surface2,border:`1px solid ${COLORS.border}`,borderRadius:8,padding:'6px 12px',color:COLORS.text,cursor:'pointer',fontSize:12}}>
                🔄 انتخاب مجدد</button>}
              <button onClick={clearRoute}
                style={{background:'transparent',border:`1px solid ${COLORS.danger}`,borderRadius:8,padding:'6px 12px',color:COLORS.danger,cursor:'pointer',fontSize:12}}>
                ❌ لغو</button>
            </div>
          </div>}

          {/* Route result */}
          {rr&&<div style={{marginBottom:12,padding:14,border:`1px solid rgba(59,130,246,.3)`,borderRadius:14,background:'rgba(59,130,246,.08)'}}>
            <h4 style={{margin:'0 0 8px',color:COLORS.accent,fontSize:14}}>🗺️ مسیریابی</h4>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <div style={{padding:'8px 12px',background:COLORS.surface,borderRadius:8}}>
                <div style={{fontSize:11,color:COLORS.muted}}>فاصله</div>
                <div style={{fontWeight:700,fontSize:16,color:COLORS.accent}}>{rr.d.toFixed(1)} کیلومتر</div>
              </div>
              <div style={{padding:'8px 12px',background:COLORS.surface,borderRadius:8}}>
                <div style={{fontSize:11,color:COLORS.muted}}>زمان</div>
                <div style={{fontWeight:700,fontSize:16,color:COLORS.success}}>~{rr.t.toFixed(0)} دقیقه</div>
              </div>
            </div>
            <button onClick={()=>{
              window.open(`https://www.google.com/maps/dir/${rf?.lat||0},${rf?.lng||0}/${rr.route.geometry.coordinates[rr.route.geometry.coordinates.length-1][1]},${rr.route.geometry.coordinates[rr.route.geometry.coordinates.length-1][0]}`, '_blank');
            }} style={{width:'100%',background:'transparent',border:`1px solid ${COLORS.border}`,borderRadius:8,padding:'8px',color:COLORS.text,cursor:'pointer',fontSize:12,marginBottom:6}}>
              🔗 باز کردن در گوگل مپ</button>
            <button onClick={clearRoute}
              style={{width:'100%',background:`${COLORS.danger}15`,border:`1px solid ${COLORS.danger}`,borderRadius:8,padding:'8px',color:COLORS.danger,cursor:'pointer',fontSize:12}}>
              ❌ پاک کردن مسیر</button>
          </div>}

          {/* Transit info */}
          {panel==='transit'&&sel&&sel.type==='metro'&&(
            <div><h4 style={{margin:'0 0 4px',fontSize:15}}>🚇 {sel.name}</h4>
              <p style={{margin:'0 0 8px',fontSize:12,color:COLORS.muted}}>{sel.subtitle}</p>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>flyTo(sel.lat,sel.lng)} style={{flex:1,background:COLORS.accent,border:'none',borderRadius:8,padding:'8px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12}}>📍 نمایش</button>
                <button onClick={()=>startRoute(sel)} style={{flex:1,background:COLORS.surface2,border:`1px solid ${COLORS.border}`,borderRadius:8,padding:'8px',color:COLORS.text,cursor:'pointer',fontSize:12}}>🗺️ مسیریابی</button>
              </div>
            </div>
          )}

          {/* POI info */}
          {sel&&sel.type==='poi'&&(
            <div><h4 style={{margin:'0 0 4px',fontSize:15}}>{ICON[sel.name]||'📍'} {sel.name}</h4>
              <p style={{margin:'0 0 8px',fontSize:12,color:COLORS.muted}}>{sel.subtitle}</p>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>flyTo(sel.lat,sel.lng)} style={{flex:1,background:COLORS.accent,border:'none',borderRadius:8,padding:'8px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12}}>📍 نمایش</button>
                <button onClick={()=>startRoute(sel)} style={{flex:1,background:COLORS.surface2,border:`1px solid ${COLORS.border}`,borderRadius:8,padding:'8px',color:COLORS.text,cursor:'pointer',fontSize:12}}>🗺️ مسیریابی</button>
              </div>
            </div>
          )}

          {/* Points list */}
          {panel==='list'&&<div>
            <h4 style={{margin:'0 0 12px',fontSize:15}}>📍 نقاط من ({pts.length})</h4>
            {pts.length===0?<p style={{color:COLORS.muted,textAlign:'center',fontSize:13}}>نقطه‌ای ذخیره نشده!</p>:pts.map(p=>(
              <div key={p.id} style={sty.panelItem}
                onMouseEnter={e=>{(e.target as HTMLElement).style.borderColor='rgba(59,130,246,.4)'}}
                onMouseLeave={e=>{(e.target as HTMLElement).style.borderColor=COLORS.border}}>
                <span style={{fontSize:18}}>{ICON[p.category]||'📍'}</span>
                <div style={{flex:1}}>
                  <p style={{margin:0,fontWeight:600,fontSize:13}}>{p.name}</p>
                  <p style={{margin:0,fontSize:11,color:COLORS.muted}}>{LABEL[p.category]||'سایر'}</p>
                </div>
                <button onClick={(e)=>{e.stopPropagation();flyTo(p.lat,p.lng);}}
                  style={{background:'transparent',border:'none',color:COLORS.accent,cursor:'pointer',fontSize:15,padding:'4px'}}>📍</button>
                <button onClick={(e)=>{e.stopPropagation();removePoint(p.id);setPts(getPoints());}}
                  style={{background:'transparent',border:'none',color:COLORS.danger,cursor:'pointer',fontSize:16,padding:'4px'}}>×</button>
              </div>
            ))}</div>}

          {/* Add form */}
          {panel==='add'&&<AddForm onSubmit={addP} onCancel={()=>setPanel(null)} transitData={{transit,flyTo,setSel,setPanel,startRoute,clearRoute}}/>}
        </div>
      )}
    </div>
  );
}

// ================ ADD FORM ================
function AddForm({onSubmit,onCancel}:{
  onSubmit:(n:string,c:Point['category'],no:string)=>void;
  onCancel:()=>void;
  transitData?:any;
}){
  const [name,setName]=useState('');
  const [cat,setCat]=useState<Point['category']>('other');
  const [note,setNote]=useState('');
  return (
    <form onSubmit={e=>{e.preventDefault();if(name.trim())onSubmit(name.trim(),cat,note.trim());}}>
      <h4 style={{margin:'0 0 4px',fontSize:15}}>➕ نقطه جدید</h4>
      <p style={{fontSize:12,color:COLORS.muted,margin:'0 0 12px'}}>موقعیت فعلی مرکز نقشه ذخیره می‌شه. اول ببر نقشه رو جا درست.</p>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder='مثلاً: دانشگاه فرهنگیان مفتح'
        dir='rtl' style={{width:'100%',padding:'10px 14px',marginBottom:10,background:COLORS.surface,
          border:`1px solid ${COLORS.border}`,borderRadius:10,color:COLORS.text,fontSize:13,outline:'none'}}/>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6,marginBottom:10}}>
        {CATEGORIES.map(c=>(
          <button key={c} type='button' onClick={()=>setCat(c)}
            style={cat===c?{padding:'8px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,
              background:COLORS.accent,border:'none',color:'white',fontWeight:600}:
              {padding:'8px 4px',borderRadius:8,cursor:'pointer',fontSize:10.5,
              background:COLORS.surface,border:`1px solid ${COLORS.border}`,color:COLORS.muted}}>
            {ICON[c]} {LABEL[c]}</button>
        ))}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder='یادداشت (اختیاری)' rows={2}
        dir='rtl' style={{width:'100%',padding:'10px 14px',marginBottom:10,background:COLORS.surface,
          border:`1px solid ${COLORS.border}`,borderRadius:10,color:COLORS.text,fontSize:13,resize:'none',outline:'none'}}/>
      <div style={{display:'flex',gap:8}}>
        <button type='submit' style={{flex:1,background:COLORS.accent,border:'none',borderRadius:10,
          padding:'10px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13}}>✅ ذخیره</button>
        <button type='button' onClick={onCancel} style={{background:COLORS.surface,
          border:`1px solid ${COLORS.border}`,borderRadius:10,padding:'10px 16px',color:COLORS.muted,cursor:'pointer',fontSize:13}}>انصراف</button>
      </div>
    </form>
  );
}
