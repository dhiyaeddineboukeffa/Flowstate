import React from "react";
import { cookies } from "next/headers";
import FlowStateApp from "@/components/flowstate-app";
import ErrorBoundary from "@/components/error-boundary";

export default async function Home() {
  const cookieStore = await cookies();
  const userCookie = cookieStore.get("fs_username");
  
  return (
    <main className="min-h-screen bg-background" suppressHydrationWarning>
      <ErrorBoundary>
        <FlowStateApp username={userCookie?.value || "User"} />
      </ErrorBoundary>
    </main>
  );
}
