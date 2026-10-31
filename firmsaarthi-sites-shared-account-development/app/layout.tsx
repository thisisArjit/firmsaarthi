import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sites by FirmSaarthi — Get your site first. Try it free. Pay later.",
  description: "Get your business website first, with no payment to start. Explore it free for 3 days after it goes live, then choose to keep it for ₹1,999/year.",
  icons: {
    icon: "/firmsaarthi-logo.png",
    shortcut: "/firmsaarthi-logo.png",
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
