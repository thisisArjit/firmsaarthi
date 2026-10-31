import type { Metadata } from "next";
import "./globals.css";
import {env} from 'cloudflare:workers';

export const metadata: Metadata = {
  title: "FirmSaarthi · Transport",
  description: "FirmSaarthi Transport — consignments, invoices, suppliers and truck operations in one workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{(env as unknown as {APP_ENV?:string}).APP_ENV==='staging'&&<div role="status" style={{background:'#fff3cc',color:'#594000',padding:'8px 16px',textAlign:'center',fontSize:13,borderBottom:'1px solid #e3ce8f'}}>Staging · Test data only · Changes here do not affect your live business</div>}{children}</body>
    </html>
  );
}
