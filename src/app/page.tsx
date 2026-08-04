'use client';
import dynamic from 'next/dynamic';
const TMap=dynamic(()=>import('@/components/TehranMap'),{ssr:false,loading:()=>
  <div style={{width:'100%',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0a0a0a',color:'#7c5cfc',flexDirection:'column',gap:12}}>
    <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid rgba(124,92,252,.2)',borderTopColor:'#7c5cfc',animation:'spin .8s linear infinite'}}/>
    <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    <div style={{fontSize:15,fontWeight:700}}>تهران‌یاب</div>
  </div>
});
export default function Page(){return <TMap/>;}
