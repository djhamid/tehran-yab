'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import metro from '@/data/metro.json';
import {Point,genId,getPoints,savePoint,removePoint} from '@/lib/storage';

const ICON:{[k:string]:string}={metro:'🚇',university:'🎓',home:'🏠',cafe:'☕',shop:'🛍️',other:'📍'};
const LABEL:{[k:string]:string}={metro:'مترو',university:'دانشگاه',home:'خانه',cafe:'کافه',shop:'فروشگاه',other:'سایر'};

async function route(f:[number,number],t:[number,number]){
  try{const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${f[0]},${f[1]};${t[0]},${t[1]}?overview=full&geometries=geojson`);const d=await r.json();if(d.code==='Ok'&&d.routes[0])return d.routes[0]}catch{}return null
}

// Build search index from metro data
function buildSearchIndex(txt:string):{name:string,lat:number,lng:number,line:string,color:string}[]{
  const q=txt.toLowerCase().replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك');
  const results:{name:string,lat:number,lng:number,line:string,color:string}[]=[];
  for(const line of metro.lines){
    for(const st of line.stations){
      const sn=st.name.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();
      if(sn.includes(q) || q.includes(sn)){
        results.push({name:st.name,lat:st.lat,lng:st.lon,line:line.name,color:line.color});
      }
    }
  }
  return results.slice(0,10);
}

export default function TehranMap(){
  const mc=useRef<HTMLDivElement>(null);const mapRef=useRef<maplibregl.Map|null>(null);const markers=useRef<maplibregl.Marker[]>([]);
  const [pts,setPts]=useState<Point[]>([]);const [sel,setSel]=useState<Point|'search'|null>(null);const [panel,setPanel]=useState<'list'|'add'|null>(null);
  const [rmode,setRmode]=useState(false);const [rf,setRf]=useState<Point|null>(null);const [rr,setRr]=useState<{d:number;t:number}|null>(null);
  const [metroVis,setMetroVis]=useState(true);
  const [sq,setSq]=useState('');const [sres,setSres]=useState<{name:string,lat:number,lng:number,line:string,color:string}[]>([]);
  const load=useCallback(()=>setPts(getPoints()),[]);

  useEffect(()=>{if(!mc.current||mapRef.current)return;const map=new maplibregl.Map({container:mc.current,style:{version:8,name:'Tehran Dark',sources:{'osm':{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'},'carto':{type:'raster',tiles:['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],tileSize:256,attribution:'© CARTO'}},layers:[{id:'base',type:'raster',source:'carto'}]},center:[51.389,35.6892],zoom:11,locale:{'style.default.description':'','NavigationControl.ResetBearing':'','NavigationControl.ZoomIn':'بزرگ‌نمایی','NavigationControl.ZoomOut':'کوچک‌نمایی'}});map.addControl(new maplibregl.NavigationControl(),'top-left');
    map.on('load',()=>{mapRef.current=map;load();setTimeout(()=>map.resize(),200)});
    map.on('click',async e=>{
      if(!rmode)return;
      const np:Point={id:genId(),name:'مسیر',lat:e.lngLat.lat,lng:e.lngLat.lng,category:'other',createdAt:new Date().toISOString()};
      if(!rf){setRf(np);savePoint(np);setPts(getPoints())}else{
        const r=await route([rf.lng,rf.lat],[np.lng,np.lat]);
        if(r){setRr({d:r.distance/1000,t:r.duration/60});const sid='r'+genId();if(map.getSource(sid))(map.getSource(sid)as maplibregl.GeoJSONSource).setData(r.geometry);else{map.addSource(sid,{type:'geojson',data:r.geometry});map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#3b82f6','line-width':4}})}const b=new maplibregl.LngLatBounds();r.geometry.coordinates.forEach((c:[number,number])=>b.extend(c));map.fitBounds(b,{padding:50})}
        setRmode(false);setRf(null);setPanel(null)
      }});
    return ()=>{map.remove();mapRef.current=null};
  },[]);

  // Refresh markers
  useEffect(()=>{const map=mapRef.current;if(!map)return;markers.current.forEach(x=>x.remove());markers.current=[];
    pts.forEach(p=>{const el=document.createElement('div');el.style.cssText=`width:32px;height:32px;background:${p.category==='metro'?'#e31837':'#3b82f6'};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer`;el.textContent=ICON[p.category];
      const pop=new maplibregl.Popup({offset:25}).setHTML(`<div><b>${p.name}</b><br/><small>${LABEL[p.category]}</small></div>`);const marker=new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map);markers.current.push(marker)});
  },[pts]);

  // Metro layers
  useEffect(()=>{const map=mapRef.current;if(!map)return;
    metro.lines.forEach((line,i)=>{const lid='ml'+i;const sid='ms'+i;const coords=line.stations.map((s:{lon:number;lat:number})=>[s.lon,s.lat]);
      if(map.getSource(sid)){try{map.setLayoutProperty(lid,'visibility',metroVis?'visible':'none')}catch{}return}
      map.addSource(sid,{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({id:lid,type:'line',source:sid,paint:{'line-color':line.color,'line-width':3,'line-opacity':0.7}});
      // Station labels
      coords.forEach((c,j)=>{
        const stid=lid+'st'+j;const snid=lid+'sn'+j;
        map.addSource(stid,{type:'geojson',data:{type:'Feature',properties:{name:line.stations[j].name},geometry:{type:'Point',coordinates:c}}});
        map.addLayer({id:snid,type:'circle',source:stid,paint:{'circle-radius':5,'circle-color':line.color,'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
        map.on('click',snid,(e)=>{if(e.features?.[0]){setSel({id:genId(),name:e.features[0].properties.name,lat:c[1],lng:c[0],category:'metro',createdAt:new Date().toISOString()});setPanel(null)}});
      });
    });
  },[metroVis]);

  const flyTo=(lat:number,lng:number)=>{mapRef.current?.flyTo({center:[lng,lat],zoom:15,duration:800})};
  const addP=(n:string,cat:Point['category'],note:string)=>{const c=mapRef.current?.getCenter();if(!c)return;savePoint({id:genId(),name:n,lat:c.lat,lng:c.lng,category:cat,createdAt:new Date().toISOString(),note:note||undefined});setPts(getPoints());setPanel(null)};

  // Search handler
  const handleSearch=(v:string)=>{setSq(v);if(v.length<2){setSres([]);return};setSres(buildSearchIndex(v))};
  const selectSearch=(item:{name:string,lat:number,lng:number,line:string,color:string})=>{flyTo(item.lat,item.lng);setSq(item.name);setSres([]);setSel({id:genId(),name:item.name,lat:item.lat,lng:item.lng,category:'metro',createdAt:new Date().toISOString()})};

  return <div style={{width:'100%',height:'100vh',position:'relative',direction:'ltr'}}>
    <div ref={mc} style={{width:'100%',height:'100%'}}/>

    {/* Top bar with search */}
    <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',zIndex:10,display:'flex',flexDirection:'column',alignItems:'center',gap:6,width:400,maxWidth:'90vw'}}>
      <div style={{display:'flex',gap:8,width:'100%',background:'rgba(15,23,42,.9)',backdropFilter:'blur(12px)',border:'1px solid #334155',borderRadius:12,padding:'8px 12px',alignItems:'center'}}>
        <span style={{fontWeight:700,fontSize:15,whiteSpace:'nowrap'}}><span style={{color:'#3b82f6'}}>Tehran</span>Yab</span>
        <div style={{flex:1,position:'relative'}}>
          <input value={sq} onChange={e=>handleSearch(e.target.value)} placeholder="🔍 جستجوی ایستگاه مترو..." dir="rtl"
            style={{width:'100%',padding:'6px 12px',background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f8fafc',fontSize:13,outline:'none'}}/>
          {sres.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'#1e293b',border:'1px solid #334155',borderRadius:8,marginTop:4,maxHeight:200,overflowY:'auto',zIndex:30}}>
            {sres.map((r,i)=><div key={i} onClick={()=>selectSearch(r)} style={{padding:'8px 12px',cursor:'pointer',borderBottom:'1px solid #334155',display:'flex',alignItems:'center',gap:8}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:r.color,display:'inline-block'}}/>
              <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{r.name}</div><div style={{fontSize:11,color:'#64748b'}}>{r.line}</div></div>
            </div>)}
          </div>}
        </div>
      </div>
    </div>

    {/* Floating buttons */}
    <div style={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',display:'flex',gap:8,zIndex:10}}>
      <button onClick={()=>setPanel('list')} style={{background:'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 18px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>📍 نقاط ({pts.length})</button>
      <button onClick={()=>setPanel('add')} style={{background:'#3b82f6',border:'none',borderRadius:12,padding:'10px 18px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13}}>➕ نقطه</button>
      <button onClick={()=>setRmode(true)} style={{background:rmode?'#ef4444':'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 18px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>🗺️ مسیر</button>
      <button onClick={()=>setMetroVis(!metroVis)} style={{background:metroVis?'#8B5CF6':'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 14px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>🚇 مترو</button>
    </div>

    {/* Side panel */}
    {(panel||sel||rr||rmode)&&<div style={{position:'absolute',top:80,right:12,width:300,maxHeight:'calc(100%-140px)',background:'rgba(15,23,42,.95)',backdropFilter:'blur(16px)',border:'1px solid #334155',borderRadius:16,padding:16,overflowY:'auto',zIndex:20}}>
      {rmode&&<div style={{marginBottom:12,padding:8,background:'#1e293b',borderRadius:8}}><p style={{margin:'0 0 8px',fontSize:13,color:'#fbbf24'}}>{rf?'📍 مقصد را کلیک کنید':'📍 مبدأ را کلیک کنید'}</p><button onClick={()=>{setRmode(false);setRf(null)}} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'6px 12px',color:'white',cursor:'pointer',fontSize:12,width:'100%'}}>❌ لغو مسیریابی</button></div>}
      {rr&&<div style={{marginBottom:12,padding:12,background:'#1e293b',borderRadius:12}}><h4 style={{margin:'0 0 8px',color:'#3b82f6'}}>🗺️ نتیجه مسیریابی</h4><p style={{margin:'0 0 4px',fontSize:13}}>📏 فاصله: <b>{rr.d.toFixed(1)} کیلومتر</b></p><p style={{margin:0,fontSize:13}}>⏱️ زمان: <b>{rr.t.toFixed(0)} دقیقه</b></p></div>}
      {panel==='list'&&<div>{pts.length===0?<p style={{color:'#64748b',textAlign:'center',fontSize:13}}>نقطه‌ای ذخیره نشده. روی نقشه کلیک کنید و نقطه بذارید!</p>:pts.map(p=><div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',marginBottom:6,border:'1px solid #334155',borderRadius:8}}>
        <span style={{fontSize:18}}>{ICON[p.category]}</span><div style={{flex:1}}><p style={{margin:0,fontWeight:600,fontSize:13}}>{p.name}</p><p style={{margin:0,fontSize:11,color:'#64748b'}}>{LABEL[p.category]}</p></div>
        <button onClick={()=>flyTo(p.lat,p.lng)} style={{background:'transparent',border:'none',color:'#3b82f6',cursor:'pointer',fontSize:13}}>📍</button>
        <button onClick={()=>{removePoint(p.id);setPts(getPoints())}} style={{background:'transparent',border:'none',color:'#ef4444',cursor:'pointer',fontSize:13}}>×</button>
      </div>)}</div>}
      {sel&&sel!=='search'&&<div><h4 style={{margin:'0 0 4px'}}>{ICON[sel.category]} {sel.name}</h4><p style={{margin:'0 0 8px',fontSize:12,color:'#64748b'}}>{LABEL[sel.category]} · {sel.lat.toFixed(4)}, {sel.lng.toFixed(4)}</p>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>flyTo(sel.lat,sel.lng)} style={{flex:1,background:'#3b82f6',border:'none',borderRadius:8,padding:'8px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12}}>📍 مشاهده</button>
          <button onClick={()=>{setRmode(true);setRf(sel);setSel(null)}} style={{flex:1,background:'#1e293b',border:'1px solid #334155',borderRadius:8,padding:'8px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:12}}>🗺️ مسیریابی از اینجا</button>
        </div>
      </div>}
      {panel==='add'&&<AddForm onSubmit={addP} onCancel={()=>setPanel(null)}/>}
    </div>}
  </div>;
}

function AddForm({onSubmit,onCancel}:{onSubmit:(n:string,c:Point['category'],no:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState('');const [cat,setCat]=useState<Point['category']>('other');const [note,setNote]=useState('');
  return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSubmit(name.trim(),cat,note.trim())}}>
    <h4 style={{margin:'0 0 8px'}}>➕ نقطه جدید</h4>
    <p style={{fontSize:12,color:'#64748b',margin:'0 0 8px'}}>موقعیت فعلی نقشه ذخیره می‌شه. اول نقشه رو ببر جا درست، بعد ثبت کن.</p>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="مثلاً: دانشگاه شهید مفتح" dir="rtl" style={{width:'100%',padding:'8px 12px',marginBottom:8,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f8fafc',fontSize:13,outline:'none'}}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:4,marginBottom:8}}>
      {(['metro','university','home','cafe','shop','other'] as const).map(c=>
        <button key={c} type="button" onClick={()=>setCat(c)} style={{padding:'5px 4px',borderRadius:6,cursor:'pointer',fontSize:11,background:cat===c?'#3b82f6':'#1e293b',border:'1px solid #334155',color:cat===c?'white':'#94a3b8'}}>{ICON[c]} {LABEL[c]}</button>)}
    </div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="یادداشت (اختیاری)" rows={2} dir="rtl" style={{width:'100%',padding:'8px 12px',marginBottom:8,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f8fafc',fontSize:13,resize:'none',outline:'none'}}/>
    <div style={{display:'flex',gap:8}}><button type="submit" style={{flex:1,background:'#3b82f6',border:'none',borderRadius:8,padding:'10px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13}}>✅ ذخیره</button><button type="button" onClick={onCancel} style={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,padding:'10px 16px',color:'#94a3b8',cursor:'pointer',fontSize:13}}>انصراف</button></div>
  </form>;
}
