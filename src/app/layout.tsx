import type { Metadata, Viewport } from "next"; import "./globals.css";
export const metadata: Metadata = { title: "TehranYab", description: "Tehran interactive map" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false, themeColor: "#0f172a" };
export default function Root({children}:{children:React.ReactNode}){return <html lang="fa" dir="rtl"><body>{children}</body></html>;}
