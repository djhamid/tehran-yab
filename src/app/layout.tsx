import "./globals.css";
export const metadata={title:"تهران‌یاب",description:"نقشه هوشمند تهران"};
export const viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,themeColor:"#0a0a0a"};
export default function R({children}:{children:React.ReactNode}){
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
