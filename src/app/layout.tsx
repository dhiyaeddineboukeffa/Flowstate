import type { Metadata } from "next";
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

import { Toaster } from "@/components/ui/sonner";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} dark antialiased`}>
      <body className="min-h-screen bg-background text-foreground">
        {children}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
