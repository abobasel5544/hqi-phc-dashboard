import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "لوحة مؤشرات جودة المراكز الصحية HQI", description: "نظام إدخال سريع لمؤشرات جودة المراكز الصحية HQI 2026" };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
