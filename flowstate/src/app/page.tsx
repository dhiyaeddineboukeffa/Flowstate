import { getParentTasks, getActiveSessions, getTodaySessions, getUserPomodoroState, getRecentSubTaskIds } from "@/lib/actions";
import FlowStateApp from "@/components/flowstate-app";

import { cookies } from "next/headers";

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const username = cookieStore.get("fs_username")?.value || "User";

  let tasks, activeSessions, todaySessions, pomodoroState, recentSubTaskIds;
  try {
    [tasks, activeSessions, todaySessions, pomodoroState, recentSubTaskIds] = await Promise.all([
      getParentTasks(),
      getActiveSessions(),
      getTodaySessions(),
      getUserPomodoroState(),
      getRecentSubTaskIds()
    ]);
  } catch (e) {
    console.error("Error fetching data in page.tsx:", e);
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background" suppressHydrationWarning>
      <FlowStateApp 
        initialTasks={tasks} 
        initialActiveSessions={activeSessions} 
        initialTodaySessions={todaySessions}
        initialPomodoroState={pomodoroState || undefined}
        initialRecentSubTaskIds={recentSubTaskIds}
        username={username}
      />
    </main>
  );
}
