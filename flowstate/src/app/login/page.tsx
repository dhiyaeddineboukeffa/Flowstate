"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { loginUser } from "@/lib/actions";
import { AnimatedGradient } from "@/components/ui/animated-gradient";
import { Timer, ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const router = useRouter();

  const addLog = (msg: string) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const formAction = async (formData: FormData) => {
    addLog("formAction triggered.");
    const uname = formData.get("username")?.toString().trim();
    if (!uname) {
      addLog("Username is empty.");
      return;
    }

    setLoading(true);
    addLog(`Attempting to login user: ${uname}`);
    try {
      await loginUser(uname);
      addLog("loginUser succeeded, pushing router.");
      router.push("/");
      router.refresh();
    } catch (error) {
      addLog(`Error caught: ${String(error)}`);
      if (error instanceof Error) {
        addLog(`Stack: ${error.stack}`);
      }
      toast.error("Failed to login");
      setLoading(false);
    }
  };

  const gradientConfig = {
    preset: "custom" as const,
    color1: "#030014",
    color2: "#150530",
    color3: "#401060",
    speed: 0.5,
    distortion: 20,
    scale: 0.8,
  };

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center relative overflow-hidden text-foreground">
      <AnimatedGradient 
        config={gradientConfig}
        className="fixed inset-0 z-0 opacity-40 pointer-events-none"
      />
      
      <div className="z-10 w-full max-w-md px-6">
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 glow-primary">
            <Timer className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Welcome to FlowState</h1>
          <p className="text-muted-foreground text-center">Enter your username to access your workspace.</p>
        </div>

        <form action={formAction} className="relative group">
          <div className="absolute inset-0 bg-primary/20 blur-[40px] rounded-full opacity-0 group-focus-within:opacity-40 transition-opacity duration-1000 pointer-events-none" />
          <div className="relative flex items-center bg-[#050505]/60 backdrop-blur-2xl border border-white/[0.05] hover:border-white/[0.1] focus-within:border-primary/30 rounded-full shadow-2xl transition-all duration-500 h-16 px-3">
            <input
              type="text"
              name="username"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full h-full text-lg bg-transparent border-none outline-none placeholder:text-muted-foreground/70 text-white font-medium px-5 disabled:opacity-50"
              autoFocus
            />
            <button 
              type="submit"
              disabled={!username.trim() || loading}
              onClick={() => addLog("Submit button tapped.")}
              className="flex items-center justify-center w-12 h-12 rounded-full shrink-0 transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] cursor-pointer"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            </button>
          </div>
        </form>

        {debugLogs.length > 0 && (
          <div className="mt-8 p-4 bg-black/80 border border-red-500/50 rounded-xl max-h-48 overflow-y-auto text-left">
            <p className="text-red-400 font-bold mb-2 text-sm uppercase tracking-wider">Debug Logs:</p>
            {debugLogs.map((log, i) => (
              <div key={i} className="text-xs font-mono text-red-200 mb-1 break-all">
                {log}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
