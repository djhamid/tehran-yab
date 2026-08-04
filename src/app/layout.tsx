import "./globals.css";
export const metadata = {
  title: "TehranYab",
  description: "نقشه تعاملی تهران — جستجو، مسیریابی و نقطه‌گذاری"
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#08090a"
};
export default function Root({children}:{children:React.ReactNode}){
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
