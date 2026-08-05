"use server";

import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getParentTasks() {
  return prisma.parentTask.findMany({
    include: { 
      subTasks: true,
      checklists: { orderBy: { id: "asc" } }
    },
    orderBy: { created_at: "asc" },
  });
}

export async function getActiveSessions() {
  return prisma.session.findMany({
    where: { end_time: null },
    include: { subTask: { include: { parentTask: true } } },
  });
}

export async function getSubTaskSessions(sub_task_id: string) {
  return prisma.session.findMany({
    where: { sub_task_id, end_time: { not: null } },
    orderBy: { start_time: "desc" },
  });
}

export async function getTodaySessions() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.session.findMany({
    where: {
      start_time: { gte: today },
      end_time: { not: null },
    },
    orderBy: { start_time: "desc" },
  });
}

// ─── Create ────────────────────────────────────────────────────────────────

export async function createParentTask(name: string) {
  const t = await prisma.parentTask.create({ 
    data: { name }, 
    include: { subTasks: true, checklists: true } 
  });
  revalidatePath("/");
  return t;
}

export async function createSubTask(parent_task_id: string, name: string) {
  const t = await prisma.subTask.create({ data: { parent_task_id, name } });
  revalidatePath("/");
  return t;
}

// ─── Update ────────────────────────────────────────────────────────────────

export async function renameParentTask(id: string, name: string) {
  await prisma.parentTask.update({ where: { id }, data: { name } });
  revalidatePath("/");
}

export async function renameSubTask(id: string, name: string) {
  await prisma.subTask.update({ where: { id }, data: { name } });
  revalidatePath("/");
}

export async function updateParentTaskNotes(id: string, notes: string) {
  await prisma.parentTask.update({ where: { id }, data: { general_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionNotes(id: string, notes: string) {
  await prisma.session.update({ where: { id }, data: { session_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionTime(
  session_id: string,
  start_time: Date,
  end_time: Date | null,
  duration: number
) {
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
  await prisma.parentTask.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteSubTask(id: string) {
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

export async function createChecklistItem(parent_task_id: string, text: string) {
  await prisma.checklistItem.create({
    data: { parent_task_id, text }
  });
  revalidatePath("/");
}

export async function toggleChecklistItem(id: string, done: boolean) {
  await prisma.checklistItem.update({
    where: { id },
    data: { done }
  });
  revalidatePath("/");
}

export async function deleteChecklistItem(id: string) {
  await prisma.checklistItem.delete({ where: { id } });
  revalidatePath("/");
}
