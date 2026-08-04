'use client';
import dynamic from 'next/dynamic';
const Map = dynamic(() => import('@/components/Map'), { ssr: false, loading: () => <div style={{width:'100%',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0f172a',color:'#3b82f6',flexDirection:'column'}}><div style={{fontSize:48}}>🗺️</div><div style={{fontSize:18,fontWeight:700}}>TehranYab</div><div style={{fontSize:13,color:'#64748b'}}>Loading...</div></div> });
export default function Home(){return <Map/>;}
