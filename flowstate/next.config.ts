import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "unstiffly-overelliptical-elisha.ngrok-free.dev", 
    "*.ngrok-free.dev", 
    "*.loca.lt", 
    "*.lhr.life"
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "unstiffly-overelliptical-elisha.ngrok-free.dev", 
        "*.ngrok-free.dev", 
        "*.loca.lt", 
        "*.lhr.life"
      ]
    }
  }
};

export default nextConfig;
