import FlowStateApp from "@/components/flowstate-app";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cookieStore = await cookies();
  const username = cookieStore.get("fs_username")?.value || "User";
  const userId = cookieStore.get("fs_userid")?.value;

  if (!userId) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background" suppressHydrationWarning>
      <FlowStateApp username={username} />
    </main>
  );
}
