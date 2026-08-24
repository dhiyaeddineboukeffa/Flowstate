import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "unstiffly-overelliptical-elisha.ngrok-free.dev", 
    "*.ngrok-free.dev", 
    "*.loca.lt", 
    "*.lhr.life",
    "*.vercel.app"
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "unstiffly-overelliptical-elisha.ngrok-free.dev", 
        "*.ngrok-free.dev", 
        "*.loca.lt", 
        "*.lhr.life",
        "*.vercel.app"
      ]
    }
  }
};

export default nextConfig;
