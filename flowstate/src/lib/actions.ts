"use server";

import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

// ─── Auth ──────────────────────────────────────────────────────────────────

async function getUserId() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function loginUser(username: string) {
  const uname = username.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { username: uname } });
  if (!user) {
    user = await prisma.user.create({ data: { username: uname } });
  }
  const cookieStore = await cookies();
  cookieStore.set("fs_userid", user.id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.set("fs_username", user.username, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("fs_userid");
  cookieStore.delete("fs_username");
}

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getParentTasks() {
  const userId = await getUserId();
  return prisma.parentTask.findMany({
    where: { user_id: userId },
    include: { 
      subTasks: {
        include: { checklists: { orderBy: { created_at: "asc" } } }
      }
    },
    orderBy: { created_at: "asc" },
  });
}

export async function getActiveSessions() {
  const userId = await getUserId();
  return prisma.session.findMany({
    where: { end_time: null, subTask: { parentTask: { user_id: userId } } },
    include: { subTask: { include: { parentTask: true, checklists: true } } },
  });
}

export async function getSubTaskSessions(sub_task_id: string) {
  const userId = await getUserId();
  return prisma.session.findMany({
    where: { sub_task_id, end_time: { not: null }, subTask: { parentTask: { user_id: userId } } },
    orderBy: { start_time: "desc" },
  });
}

export async function getTodaySessions() {
  const userId = await getUserId();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.session.findMany({
    where: {
      start_time: { gte: today },
      end_time: { not: null },
      subTask: { parentTask: { user_id: userId } }
    },
    orderBy: { start_time: "desc" },
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createParentTask(name: string) {
  const userId = await getUserId();
  const t = await prisma.parentTask.create({ 
    data: { name, user_id: userId }, 
    include: { subTasks: { include: { checklists: true } } } 
  });
  revalidatePath("/");
  return t;
}

export async function createSubTask(parent_task_id: string, name: string) {
  await getUserId();
  const t = await prisma.subTask.create({ data: { parent_task_id, name } });
  revalidatePath("/");
  return t;
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function renameParentTask(id: string, name: string) {
  await getUserId();
  await prisma.parentTask.update({ where: { id }, data: { name } });
  revalidatePath("/");
}

export async function renameSubTask(id: string, name: string) {
  await getUserId();
  await prisma.subTask.update({ where: { id }, data: { name } });
  revalidatePath("/");
}

export async function updateParentTaskNotes(id: string, notes: string) {
  await getUserId();
  await prisma.parentTask.update({ where: { id }, data: { general_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionNotes(id: string, notes: string) {
  await getUserId();
  await prisma.session.update({ where: { id }, data: { session_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionTime(
  session_id: string,
  start_time: Date,
  end_time: Date | null,
  duration: number
) {
  await getUserId();
  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: session_id } });
    if (!session) return;

    const durationDiff = duration - session.duration;

    await tx.session.update({
      where: { id: session_id },
      data: { start_time, end_time, duration },
    });

    if (durationDiff !== 0) {
      const subTask = await tx.subTask.findUnique({ where: { id: session.sub_task_id } });
      if (subTask) {
        await tx.subTask.update({
          where: { id: session.sub_task_id },
          data: { total_cumulative_time: { increment: durationDiff } },
        });

        await tx.parentTask.update({
          where: { id: subTask.parent_task_id },
          data: { total_cumulative_time: { increment: durationDiff } },
        });
      }
    }
  });

  revalidatePath("/");
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteParentTask(id: string) {
  await getUserId();
  await prisma.parentTask.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteSubTask(id: string) {
  await getUserId();
  await prisma.$transaction(async (tx) => {
    const subTask = await tx.subTask.findUnique({ where: { id } });
    if (subTask && subTask.total_cumulative_time > 0) {
      await tx.parentTask.update({
        where: { id: subTask.parent_task_id },
        data: { total_cumulative_time: { decrement: subTask.total_cumulative_time } },
      });
    }
    await tx.subTask.delete({ where: { id } });
  });
  revalidatePath("/");
}

export async function deleteSession(session_id: string) {
  await getUserId();
  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: session_id } });
    if (!session) return;

    if (session.end_time && session.duration > 0) {
      const subTask = await tx.subTask.findUnique({ where: { id: session.sub_task_id } });
      if (subTask) {
        await tx.subTask.update({
          where: { id: session.sub_task_id },
          data: { total_cumulative_time: { decrement: session.duration } },
        });

        await tx.parentTask.update({
          where: { id: subTask.parent_task_id },
          data: { total_cumulative_time: { decrement: session.duration } },
        });
      }
    }

    await tx.session.delete({ where: { id: session_id } });
  });
  revalidatePath("/");
}

// ─── Timer ─────────────────────────────────────────────────────────────────

export async function startSession(sub_task_id: string) {
  await getUserId();
  const session = await prisma.session.create({
    data: {
      sub_task_id,
      start_time: new Date(),
    },
  });
  revalidatePath("/");
  return session;
}

export async function stopSession(session_id: string) {
  await getUserId();
  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: session_id } });
    if (!session || session.end_time) return;
    
    const end_time = new Date();
    // Calculate total duration (excluding paused time)
    const elapsedTotal = Math.round((end_time.getTime() - session.start_time.getTime()) / 1000);
    let duration = Math.max(0, elapsedTotal - session.accumulated_paused_time);
    
    // If it was paused when stopped, subtract the final paused chunk as well
    if (session.is_paused && session.last_paused_at) {
      const finalPauseTime = Math.round((end_time.getTime() - session.last_paused_at.getTime()) / 1000);
      duration = Math.max(0, duration - finalPauseTime);
    }

    await tx.session.update({
      where: { id: session_id },
      data: { end_time, duration, is_paused: false, last_paused_at: null },
    });

    // Update cumulative times
    const subTask = await tx.subTask.findUnique({ where: { id: session.sub_task_id } });
    if (subTask) {
      await tx.subTask.update({
        where: { id: session.sub_task_id },
        data: { total_cumulative_time: { increment: duration } },
      });

      await tx.parentTask.update({
        where: { id: subTask.parent_task_id },
        data: { total_cumulative_time: { increment: duration } },
      });
    }
  });

  revalidatePath("/");
}

export async function pauseSession(session_id: string) {
  await getUserId();
  await prisma.session.update({
    where: { id: session_id },
    data: { 
      is_paused: true, 
      last_paused_at: new Date() 
    }
  });
  revalidatePath("/");
}

export async function resumeSession(session_id: string) {
  await getUserId();
  const session = await prisma.session.findUnique({ where: { id: session_id } });
  if (!session || !session.is_paused || !session.last_paused_at) return;
  
  const now = new Date();
  const pausedDuration = Math.round((now.getTime() - session.last_paused_at.getTime()) / 1000);
  
  await prisma.session.update({
    where: { id: session_id },
    data: {
      is_paused: false,
      last_paused_at: null,
      accumulated_paused_time: { increment: pausedDuration }
    }
  });
  revalidatePath("/");
}

// ─── Checklists ────────────────────────────────────────────────────────────

export async function createChecklistItem(sub_task_id: string, text: string) {
  await getUserId();
  await prisma.checklistItem.create({
    data: { sub_task_id, text }
  });
  revalidatePath("/");
}

export async function toggleChecklistItem(id: string, done: boolean) {
  await getUserId();
  await prisma.checklistItem.update({
    where: { id },
    data: { done }
  });
  revalidatePath("/");
}

export async function deleteChecklistItem(id: string) {
  await getUserId();
  await prisma.checklistItem.delete({ where: { id } });
  revalidatePath("/");
}

// ─── User Pomodoro State ───────────────────────────────────────────────────

export async function getUserPomodoroState() {
  const userId = await getUserId();
  return prisma.user.findUnique({ where: { id: userId } });
}

export async function updateUserPomodoroState(data: {
  pomodoroMode?: boolean;
  workDuration?: number;
  shortBreakDuration?: number;
  longBreakDuration?: number;
  sessionsBeforeLongBreak?: number;
  pomodoroPhase?: string;
  pomodorosCompleted?: number;
  breakStartTime?: Date | null;
  pomodoroAccumulated?: number;
}) {
  const userId = await getUserId();
  await prisma.user.update({
    where: { id: userId },
    data,
  });
  revalidatePath("/");
}
