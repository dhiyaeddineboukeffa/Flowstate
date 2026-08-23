import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const user = await db.collection<any>("User").findOne(
    { _id: userId },
    {
      projection: {
        pomodoroMode: 1,
        workDuration: 1,
        shortBreakDuration: 1,
        longBreakDuration: 1,
        sessionsBeforeLongBreak: 1,
        pomodoroPhase: 1,
        pomodorosCompleted: 1,
        breakStartTime: 1,
        pomodoroAccumulated: 1,
      }
    }
  );

  return NextResponse.json(user);
}
