import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";

export async function GET() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clientPromise;
  const db = client.db("flowstate");

  const mongoId = (ObjectId.isValid(userId) && (userId.length === 12 || userId.length === 24)) ? new ObjectId(userId) : userId;

  const user = await db.collection("User").findOne(
    { _id: mongoId as any },
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
