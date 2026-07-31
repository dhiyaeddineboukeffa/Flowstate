import { getParentTasks, getActiveSessions } from "@/lib/actions";
import FlowStateApp from "@/components/flowstate-app";

export default async function Home() {
  const tasks = await getParentTasks();
  const activeSessions = await getActiveSessions();

  return (
    <main className="min-h-screen bg-background">
      <FlowStateApp initialTasks={tasks} initialActiveSessions={activeSessions} />
    </main>
  );
}
