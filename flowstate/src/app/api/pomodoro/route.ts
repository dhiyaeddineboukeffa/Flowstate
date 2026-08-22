import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pomodoroMode: true,
      workDuration: true,
      shortBreakDuration: true,
      longBreakDuration: true,
      sessionsBeforeLongBreak: true,
      pomodoroPhase: true,
      pomodorosCompleted: true,
      breakStartTime: true,
      pomodoroAccumulated: true,
    }
  });

  return NextResponse.json(user);
}
