'use client';
import dynamic from 'next/dynamic';
const TMap=dynamic(()=>import('@/components/TehranMap'),{ssr:false,loading:()=>
  <div style={{width:'100%',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0b0d12',color:'#5eead4',flexDirection:'column',gap:12}}>
    <div style={{width:40,height:40,borderRadius:'50%',border:'3px solid rgba(94,234,212,.2)',borderTopColor:'#5eead4',animation:'spin .8s linear infinite'}}/>
    <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    <div style={{fontSize:15,fontWeight:700}}>تهران‌یاب</div>
  </div>
});
export default function Page(){return <TMap/>;}
