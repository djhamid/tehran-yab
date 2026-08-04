'use client';
import dynamic from 'next/dynamic';
const TehranMap = dynamic(() => import('@/components/TehranMap'), {
  ssr: false,
  loading: () => (
    <div style={{
      width:'100%',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',
      background:'var(--bg)',color:'var(--accent)',flexDirection:'column',gap:16
    }}>
      <div style={{fontSize:64,lineHeight:1}}>🗺️</div>
      <div style={{fontSize:24,fontWeight:700,letterSpacing:-0.5}}><span style={{color:'var(--accent)'}}>Tehran</span>Yab</div>
      <div style={{fontSize:14,color:'#64748b'}}>بارگذاری نقشه...</div>
      <div style={{width:120,height:3,background:'var(--border)',borderRadius:4,overflow:'hidden',marginTop:8}}>
        <div style={{width:'30%',height:'100%',background:'var(--accent)',borderRadius:4,animation:'pulse 1.2s ease-in-out infinite'}}/>
      </div>
      <style>{`@keyframes pulse{0%,100%{transform:translateX(-100%)}50%{transform:translateX(300%)}}`}</style>
    </div>
  )
});
export default function Home(){return <TehranMap/>;}
