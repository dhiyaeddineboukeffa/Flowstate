import { getParentTasks, getActiveSessions, getTodaySessions } from "@/lib/actions";
import FlowStateApp from "@/components/flowstate-app";

import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const username = cookieStore.get("fs_username")?.value || "User";

  const tasks = await getParentTasks();
  const activeSessions = await getActiveSessions();
  const todaySessions = await getTodaySessions();

  return (
    <main className="min-h-screen bg-background" suppressHydrationWarning>
      <FlowStateApp 
        initialTasks={tasks} 
        initialActiveSessions={activeSessions} 
        initialTodaySessions={todaySessions}
        username={username}
      />
    </main>
  );
}
