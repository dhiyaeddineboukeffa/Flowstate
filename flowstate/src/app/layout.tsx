import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowState — Time Tracker",
  description: "Premium minimalist time tracking for deep work",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} dark antialiased`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground transition-colors duration-300" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: `if (!localStorage.getItem('fs_v3_wipe')) { localStorage.clear(); localStorage.setItem('fs_v3_wipe', 'true'); }` }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
