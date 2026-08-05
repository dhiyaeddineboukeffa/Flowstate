import { getParentTasks, getActiveSessions, getTodaySessions } from "@/lib/actions";
import FlowStateApp from "@/components/flowstate-app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const tasks = await getParentTasks();
  const activeSessions = await getActiveSessions();
  const todaySessions = await getTodaySessions();

  return (
    <main className="min-h-screen bg-background">
      <FlowStateApp initialTasks={tasks} initialActiveSessions={activeSessions} initialTodaySessions={todaySessions} />
    </main>
  );
}
