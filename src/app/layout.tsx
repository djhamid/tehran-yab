import "./globals.css";
export const metadata={title:"تهران‌یاب — مسیریاب مترو تهران",description:"مسیریابی هوشمند مترو تهران با نقشه و دستیار هوشمند"};
export const viewport={width:"device-width",initialScale:1,maximumScale:1,userScalable:false,themeColor:"#0b0d12"};
export default function R({children}:{children:React.ReactNode}){
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
