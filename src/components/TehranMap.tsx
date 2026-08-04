// @ts-nocheck
'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import * as ml from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import raw from '@/data/stations.json';
import graphData from '@/data/graph.json';
import linesRaw from '@/data/lines.json';
import {findRoutes} from '@/lib/route-finder';
import type {Graph,StationsMap,RouteResult} from '@/types/tehgo-metro';

const graph=graphData as Graph;
const stations=stationsData();
const lines=linesRaw;
let _stations=raw;

function stationsData(){return _stations as StationsMap;}
const normalize=(s:string)=>s.replace(/[آا]/g,'ا').replace(/ی/g,'ي').replace(/ک/g,'ك').toLowerCase();
const C={bg:'#0a0a0a',srf:'#141414',brd:'rgba(255,255,255,.07)',brd2:'rgba(255,255,255,.06)',accent:'#7c5cfc',accent2:'#b8a0ff',green:'#22c55e',red:'#ff6b6b',orange:'#f59e0b',txt:'#fff',txt2:'#999',txt3:'#666'};

function searchAll(q:string){
  const qn=normalize(q.trim());if(qn.length<2)return[];
  const rv:any[]=[],seen=new Set<string>();
  for(const[k,v]of Object.entries(raw as any)){
    if(v.disabled)continue;
    const fa=v.translations?.fa||v.name;
    if(normalize(fa).includes(qn)||normalize(v.name).includes(qn)){
      const key=fa;if(seen.has(key))continue;seen.add(key);
      rv.push({name:fa,lat:Number(v.latitude),lng:Number(v.longitude),type:'metro',id:k,color:v.colors?.[0]||'#7c5cfc',subtitle:'مترو'});
    }
  }
  return rv.slice(0,10);
}

export default function TMap(){
  const mc=useRef<HTMLDivElement>(null);const mr=useRef<ml.Map|null>(null);
  const dots=useRef<ml.Marker[]>([]);const rMarks=useRef<ml.Marker[]>([]);const rLine=useRef('');

  const [sq,setSq]=useState('');const [sDrop,setSDrop]=useState(false);const [sRes,setSRes]=useState<any[]>([]);
  const [sheet,setSheet]=useState<string|null>(null);const [sel,setSel]=useState<any>(null);
  const [rmode,setRmode]=useState(false);const [rf,setRf]=useState<any>(null);const [rr,setRr]=useState<any>(null);
  const [showDots,setShowDots]=useState(true);
  const [mf,setMf]=useState('');const [mt,setMt]=useState('');const [mRes,setMRes]=useState<RouteResult[]>([]);
  const [loading,setLoading]=useState(false);

  const fly=(lat,lng,z=16)=>{mr.current?.flyTo({center:[lng,lat],zoom:z,duration:500});};
  const clearR=()=>{
    rMarks.current.forEach(m=>m.remove());rMarks.current=[];
    if(rLine.current){try{mr.current?.removeLayer(rLine.current);mr.current?.removeSource(rLine.current);}catch{}}rLine.current='';
    setRr(null);setRf(null);setRmode(false);setMRes([]);
  };

  useEffect(()=>{if(!mc.current||mr.current)return;
    const m=new ml.Map({container:mc.current,style:{version:8,name:'T',sources:{r:{type:'raster',tiles:['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'],tileSize:256,attribution:'CARTO'}},layers:[{id:'b',type:'raster',source:'r'}]},center:[51.389,35.6892],zoom:11});
    m.addControl(new ml.NavigationControl({showCompass:false}),'top-left');
    m.on('load',()=>{mr.current=m;setTimeout(()=>m.resize(),100);});return ()=>{m.remove();mr.current=null;};},[]);

  useEffect(()=>{const m=mr.current;if(!m)return;
    dots.current.forEach(d=>d.remove());dots.current=[];
    if(!showDots)return;
    for(const[k,v]of Object.entries(raw as any)){
      if(v.disabled)continue;
      const color=v.colors?.[0]||'#7c5cfc';
      const el=document.createElement('div');
      el.style.cssText=`width:10px;height:10px;background:${color};border:2px solid rgba(255,255,255,.8);border-radius:50%;cursor:pointer`;
      const pop=new ml.Popup({offset:10,closeButton:true}).setHTML(`<div><b>${v.translations?.fa||v.name}</b></div>`);
      const ma=new ml.Marker({element:el}).setLngLat([Number(v.longitude),Number(v.latitude)]).setPopup(pop).addTo(m);
      el.onclick=()=>{setSel({name:v.translations?.fa||v.name,lat:Number(v.latitude),lng:Number(v.longitude),type:'metro',id:k});setSheet(null);};
      dots.current.push(ma);
    }
  },[showDots]);

  const doSearch=async(v)=>{setSq(v);setSRes(searchAll(v));setSDrop(true);};
  const selSearch=(r)=>{setSq(r.name);setSDrop(false);setSel(r);fly(r.lat,r.lng);};
  const stList=Object.entries(raw).filter(([_,v])=>!v.disabled).sort((a,b)=>a[1].translations?.fa?.localeCompare(b[1].translations?.fa||'')||0);

  const findMetroR=()=>{if(!mf||!mt)return;
    const r=findRoutes(graph,stations,mf,mt,5);
    setMRes(r);if(!r.length)return;clearR();const m=mr.current;
    if(!m)return;const best=r[0];
    const coords=best.steps.filter(s=>stations[s.stationId]).map(s=>[Number(stations[s.stationId].longitude),Number(stations[s.stationId].latitude)]);
    if(coords.length<2)return;const sid='mr_'+Date.now();
    m.addSource(sid,{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:coords}}});
    m.addLayer({id:sid,type:'line',source:sid,paint:{'line-color':'#a78bfa','line-width':6}});rLine.current=sid;
    const b=new ml.LngLatBounds();coords.forEach(c=>b.extend(c));m.fitBounds(b,{padding:80});
    const el=document.createElement('div');el.style.cssText='width:14px;height:14px;background:#8b5cf6;border:2px solid #fff;border-radius:50%';
    rMarks.current.push(new ml.Marker({element:el}).setLngLat([Number(stations[mf].longitude),Number(stations[mf].latitude)]).addTo(m));
    const el2=document.createElement('div');el2.style.cssText='width:14px;height:14px;background:#ef4444;border:2px solid #fff;border-radius:50%';
    rMarks.current.push(new ml.Marker({element:el2}).setLngLat([Number(stations[mt].longitude),Number(stations[mt].latitude)]).addTo(m));
    setSheet('metro-r');setRr({isMetro:true,results:r});
  };

  return <div style={{width:'100%',height:'100dvh',position:'relative',overflow:'hidden'}}>
    <div id="map" ref={mc}/>
    <div className="top">
      <div className="logo"><span>تهران</span>یاب</div>
      <div className="s-wrap">
        <input value={sq} onChange={e=>doSearch(e.target.value)} onFocus={()=>sRes.length>0&&setSDrop(true)} placeholder="جستجوی ایستگاه..." onBlur={()=>setTimeout(()=>setSDrop(false),200)}/>
        <div className={`s-drop ${sDrop&&sRes.length>0?'show':''}`}>
          {sRes.map((r,i)=><div key={i} onClick={()=>selSearch(r)}>
            <div className="s-icon" style={{background:`${r.color}22`,color:r.color,border:`1px solid ${r.color}44`}}>🚇</div>
            <div style={{flex:1}}><b style={{fontSize:13}}>{r.name}</b><br/><span style={{fontSize:11,color:C.txt2}}>{r.subtitle||''}</span></div>
          </div>)}
        </div>
      </div>
    </div>
    <div className="toolbar">
      <button onClick={()=>setSheet('route')} className={sheet==='route'?'active':''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>مسیر</button>
      <button onClick={()=>setSheet('metro')} className={sheet==='metro'?'active':''}><svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/><text x="12" y="15" textAnchor="middle" fill="#fff" fontSize="10">M</text></svg>مترو</button>
      <button onClick={()=>setShowDots(!showDots)} style={{color:showDots?C.accent2:C.txt,opacity:showDots?1:.5}}>● ایستگاه‌ها</button>
      <button onClick={()=>setSheet('info')} className={sel?'active':''}>📍 جزئیات</button>
    </div>
    <div className={`overlay ${sheet?'show':''}`} onClick={()=>setSheet(null)}/>
    <div className={`sheet ${sheet?'show':''}`}>
      <div className="sheet-handle"/>
      <div className="sheet-header">
        <div className="sheet-title">
          {sheet==='route'?'🗺️ مسیریابی':sheet==='metro'?'🚇 مترو تهران':sheet==='metro-r'?'🚇 مسیر مترو':'📍 ایستگاه'}
        </div>
        <button className="sheet-close" onClick={()=>setSheet(null)}>✕</button>
      </div>
      <div className="sheet-body">
        {sheet==='route'&&<div>
          <p style={{fontSize:13,color:C.txt2,marginBottom:12}}>روی نقشه کلیک کن تا مبدأ و مقصد مسیر ماشین رو انتخاب کنی</p>
          {!rr?.driving&&!rmode&&<button className="btn btn-primary" onClick={()=>{clearR();setRmode(true);}}>📍 شروع مسیریابی</button>}
          {rmode&&<div style={{padding:12,borderRadius:12,border:`1px solid ${C.orange}33`,background:`${C.orange}10`,marginBottom:12,textAlign:'center'}}>
            {rf?'📍 حالا مقصد را کلیک کنید':'📍 مبدأ را کلیک کنید'}
          </div>}
          {rr?.driving&&<div>
            <div className="r-stats"><div className="r-stat"><div className="r-stat-vg">{rr.d?.toFixed(1)}</div><div className="r-stat-lb">کیلومتر</div></div><div className="r-stat"><div className="r-stat-vg" style={{color:C.green}}>~{rr.t?.toFixed(0)}</div><div className="r-stat-lb">دقیقه</div></div></div>
            <button className="btn btn-danger btn-sm" onClick={clearR}>❌ پاک کردن مسیر</button>
          </div>}
        </div>}
        {sheet==='metro'&&<div>
          <p style={{fontSize:13,color:C.txt2,marginBottom:10}}>مبدأ و مقصد را انتخاب کنید</p>
          <select value={mf} onChange={e=>setMf(e.target.value)}><option value="">مبدأ</option>{stList.map(item=><option key={item[0]} value={item[0]}>{item[1]?.translations?.fa||item[1]?.name}</option>)}</select>
          <select value={mt} onChange={e=>setMt(e.target.value)}><option value="">مقصد</option>{stList.filter(item=>item[0]!==mf).map(item=><option key={item[0]} value={item[0]}>{item[1]?.translations?.fa||item[1]?.name}</option>)}</select>
          <button className="btn btn-primary" disabled={!mf||!mt} onClick={()=>{clearR();findMetroR();}}>🔍 پیدا کردن مسیر</button>
          <div style={{marginTop:12,display:'flex',flexWrap:'wrap',gap:4}}>
            {['tajrish','shahid_beheshti','meydan_e_hazrat_vali_asr','imam_hossein','imam_khomeini','tehran_sadeghiyeh'].map(id=>{
              const s=raw[id];if(!s)return null;
              return <button key={id} onClick={()=>{if(!mf)setMf(id);else if(!mt&&id!==mf)setMt(id);}} style={{padding:'5px 10px',borderRadius:8,background:'rgba(124,92,252,.1)',border:'1px solid rgba(124,92,252,.2)',color:C.accent2,cursor:'pointer',fontSize:10,fontFamily:'V,system-ui'}}>{s.translations?.fa||s.name}</button>;
            })}
          </div>
        </div>}
        {sheet==='metro-r'&&mRes.length>0&&<div>
          <div className="r-stats"><div className="r-stat"><div className="r-stat-val">{mRes[0].totalStations}</div><div className="r-stat-lb">ایستگاه</div></div><div className="r-stat"><div className="r-stat-val" style={{color:C.orange}}>{mRes[0].totalTransfers}</div><div className="r-stat-lb">تعویض خط</div></div></div>
          <div style={{fontSize:12,color:C.txt2,marginBottom:8}}>خطوط: {mRes[0].lines.join(', ')}</div>
          {mRes[0].steps.map((s,i)=>{
            const st=stations[s.stationId];const col=lines?.[s.line]?.color||'#7c5cfc';
            return <div key={i} className="r-step"><div className="r-dot" style={{background:col}}/><div className="r-line"><div className="r-name">{st?.translations?.fa||st?.name||s.stationId}</div><div className="r-desc">{lines?.[s.line]?.name?.fa||s.line}{s.transferTo?` → ${lines?.[s.transferTo]?.name?.fa}`:''}</div></div></div>;
          })}
          <button className="btn btn-danger btn-sm" onClick={()=>{clearR();setSheet('metro');}}>🔄 مسیر جدید</button>
        </div>}
        {sel&&<div>
          <h3 style={{fontSize:16,marginBottom:4}}>🚇 {sel.name}</h3>
          <p style={{fontSize:13,color:C.txt2,marginBottom:8}}>ایستگاه مترو</p>
          <div style={{display:'flex',gap:6}}>
            <button className="btn btn-primary btn-sm" onClick={()=>fly(sel.lat,sel.lng)}>📍 نمایش</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setSheet('route');clearR();setRmode(true);}}>🗺️ مسیر ماشین</button>
          </div>
          {sel.id&&<div style={{marginTop:8}}><button className="btn btn-ghost btn-sm" onClick={()=>{setMf(sel.id);setSheet('metro');}}>🚇 مترو از اینجا</button></div>}
        </div>}
      </div>
    </div>
  </div>;
}
