'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import metro from '@/data/metro.json';
import {Point,genId,getPoints,savePoint,removePoint} from '@/lib/storage';

const C:{[k:string]:string}={metro:'🚇',university:'🎓',home:'🏠',cafe:'☕',shop:'🛍️',other:'📍'};
const L:{[k:string]:string}={metro:'مترو',university:'دانشگاه',home:'خانه',cafe:'کافه',shop:'فروشگاه',other:'سایر'};

async function route(f:[number,number],t:[number,number]){
  try{const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${f[0]},${f[1]};${t[0]},${t[1]}?overview=full&geometries=geojson`);const d=await r.json();if(d.code==='Ok'&&d.routes[0])return d.routes[0]}catch{}return null
}

export default function Map(){
  const mc=useRef<HTMLDivElement>(null);const m=useRef<maplibregl.Map|null>(null);const mk=useRef<maplibregl.Marker[]>([]);
  const [pts,setPts]=useState<Point[]>([]);const [sel,setSel]=useState<Point|null>(null);const [panel,setPanel]=useState<'list'|'add'|null>(null);
  const [rmode,setRmode]=useState(false);const [rf,setRf]=useState<Point|null>(null);const [rr,setRr]=useState<{d:number;t:number}|null>(null);
  const [metroVis,setMetroVis]=useState(true);
  const load=useCallback(()=>setPts(getPoints()),[]);

  useEffect(()=>{if(!mc.current||m.current)return;const map=new maplibregl.Map({container:mc.current,style:'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',center:[51.389,35.6892],zoom:11});map.addControl(new maplibregl.NavigationControl(),'top-left');
    map.on('load',()=>{m.current=map;load()});
    map.on('click',async e=>{
      if(!rmode)return;
      const np:Point={id:genId(),name:'مسیر',lat:e.lngLat.lat,lng:e.lngLat.lng,category:'other',createdAt:new Date().toISOString()};
      if(!rf){setRf(np);savePoint(np);setPts(getPoints())}else{
        const r=await route([rf.lng,rf.lat],[np.lng,np.lat]);
        if(r){setRr({d:r.distance/1000,t:r.duration/60});const sid='r'+genId();if(map.getSource(sid))(map.getSource(sid)as maplibregl.GeoJSONSource).setData(r.geometry);else{map.addSource(sid,{type:'geojson',data:r.geometry});map.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#3b82f6','line-width':4}})}const b=new maplibregl.LngLatBounds();r.geometry.coordinates.forEach((c:[number,number])=>b.extend(c));map.fitBounds(b,{padding:50})}
        setRmode(false);setRf(null);setPanel(null)
      }});
    return ()=>{map.remove();m.current=null};
  },[]);

  useEffect(()=>{const map=m.current;if(!map)return;mk.current.forEach(x=>x.remove());mk.current=[];
    pts.forEach(p=>{const el=document.createElement('div');el.style.cssText=`width:32px;height:32px;background:${p.category==='metro'?'#e31837':'#3b82f6'};border:2px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer`;
      el.textContent=C[p.category];
      const pop=new maplibregl.Popup({offset:25}).setHTML(`<div><b>${p.name}</b><br/><small>${L[p.category]}</small></div>`);
      const marker=new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).setPopup(pop).addTo(map);
      mk.current.push(marker);
    });
  },[pts]);

  useEffect(()=>{const map=m.current;if(!map)return;
    metro.lines.forEach((line,i)=>{const lid='ml'+i;const sid='ms'+i;const coords=line.stations.map((s:{lon:number;lat:number})=>[s.lon,s.lat]);
      if(map.getSource(sid)){try{map.setLayoutProperty(lid,'visibility',metroVis?'visible':'none')}catch{}return}
      map.addSource(sid,{type:'geojson',data:{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}});
      map.addLayer({id:lid,type:'line',source:sid,paint:{'line-color':line.color,'line-width':3,'line-opacity':0.7}});
    });
  },[metroVis]);

  const addP=(n:string,cat:Point['category'],note:string)=>{const c=m.current?.getCenter();if(!c)return;savePoint({id:genId(),name:n,lat:c.lat,lng:c.lng,category:cat,createdAt:new Date().toISOString(),note:note||undefined});setPts(getPoints());setPanel(null)};

  return <div style={{width:'100%',height:'100vh',position:'relative',direction:'ltr'}}>
    <div ref={mc} style={{width:'100%',height:'100%'}}/>
    <div style={{position:'absolute',top:12,left:'50%',transform:'translateX(-50%)',background:'rgba(15,23,42,.9)',backdropFilter:'blur(12px)',border:'1px solid #334155',borderRadius:12,padding:'8px 16px',zIndex:10}}><strong><span style={{color:'#3b82f6'}}>Tehran</span>Yab</strong></div>
    <div style={{position:'absolute',bottom:24,left:'50%',transform:'translateX(-50%)',display:'flex',gap:8,zIndex:10}}>
      <button onClick={()=>setPanel('list')} style={{background:'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 18px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>📍 نقاط ({pts.length})</button>
      <button onClick={()=>setPanel('add')} style={{background:'#3b82f6',border:'none',borderRadius:12,padding:'10px 18px',color:'white',cursor:'pointer',fontWeight:700,fontSize:13}}>➕ نقطه</button>
      <button onClick={()=>setRmode(true)} style={{background:rmode?'#ef4444':'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 18px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>🗺️ مسیر</button>
      <button onClick={()=>setMetroVis(!metroVis)} style={{background:metroVis?'#8B5CF6':'rgba(30,41,59,.95)',border:'1px solid #334155',borderRadius:12,padding:'10px 14px',color:'#f8fafc',cursor:'pointer',fontWeight:600,fontSize:13}}>🚇 مترو</button>
    </div>

    {(panel||rr||rmode)&&<div style={{position:'absolute',top:70,right:12,width:300,maxHeight:'calc(100%-120px)',background:'rgba(15,23,42,.95)',backdropFilter:'blur(16px)',border:'1px solid #334155',borderRadius:16,padding:16,overflowY:'auto',zIndex:20}}>
      {rmode&&<div style={{marginBottom:12,padding:8,background:'#1e293b',borderRadius:8}}><p style={{margin:'0 0 8px',fontSize:13,color:'#fbbf24'}}>{rf?'مقصد را کلیک کنید':'مبدأ را کلیک کنید'}</p><button onClick={()=>{setRmode(false);setRf(null)}} style={{background:'#ef4444',border:'none',borderRadius:6,padding:'6px 12px',color:'white',cursor:'pointer',fontSize:12,width:'100%'}}>❌ لغو</button></div>}
      {rr&&<div style={{marginBottom:12,padding:12,background:'#1e293b',borderRadius:12}}><h4 style={{margin:'0 0 8px',color:'#3b82f6'}}>🗺️ نتیجه</h4><p style={{margin:'0 0 4px',fontSize:13}}>📏 فاصله: <b>{rr.d.toFixed(1)} کیلومتر</b></p><p style={{margin:0,fontSize:13}}>⏱️ زمان: <b>{rr.t.toFixed(0)} دقیقه</b></p></div>}
      {panel==='list'&&<div>{pts.length===0?<p style={{color:'#64748b',textAlign:'center',fontSize:13}}>نقطه‌ای ذخیره نشده</p>:pts.map(p=><div key={p.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',marginBottom:6,border:'1px solid #334155',borderRadius:8}}><span>{C[p.category]}</span><div style={{flex:1}}><p style={{margin:0,fontWeight:600,fontSize:13}}>{p.name}</p><p style={{margin:0,fontSize:11,color:'#64748b'}}>{L[p.category]}</p></div></div>)}</div>}
      {panel==='add'&&<AddForm onSubmit={addP} onCancel={()=>setPanel(null)}/>}
    </div>}
  </div>;
}

function AddForm({onSubmit,onCancel}:{onSubmit:(n:string,c:Point['category'],no:string)=>void;onCancel:()=>void}){
  const [name,setName]=useState('');const [cat,setCat]=useState<Point['category']>('other');const [note,setNote]=useState('');
  return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSubmit(name.trim(),cat,note.trim())}}><h4 style={{margin:'0 0 12px'}}>➕ نقطه جدید</h4>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="نام مکان" dir="rtl" style={{width:'100%',padding:'8px 12px',marginBottom:12,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f8fafc',fontSize:13}}/>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:12}}>{['metro','university','home','cafe','shop','other'].map(c=><button key={c} type="button" onClick={()=>setCat(c as Point['category'])} style={{padding:'6px 4px',borderRadius:6,cursor:'pointer',fontSize:12,background:cat===c?'#3b82f6':'#1e293b',border:'1px solid #334155',color:cat===c?'white':'#94a3b8'}}>{C[c]} {L[c]}</button>)}</div>
    <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="یادداشت" rows={2} dir="rtl" style={{width:'100%',padding:'8px 12px',marginBottom:12,background:'#1e293b',border:'1px solid #334155',borderRadius:8,color:'#f8fafc',fontSize:13,resize:'none'}}/>
    <div style={{display:'flex',gap:8}}><button type="submit" style={{flex:1,background:'#3b82f6',border:'none',borderRadius:8,padding:'10px',color:'white',cursor:'pointer',fontWeight:700}}>✅ ذخیره</button><button type="button" onClick={onCancel} style={{background:'#1e293b',border:'1px solid #334155',borderRadius:8,padding:'10px 16px',color:'#94a3b8',cursor:'pointer'}}>انصراف</button></div>
  </form>;
}
