import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logistrace",
  description: "Consignments, invoices and truck payments in one private workspace.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
