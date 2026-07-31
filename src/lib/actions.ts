"use server";

import { prisma } from "./prisma";
import { revalidatePath } from "next/cache";

// ─── Read ──────────────────────────────────────────────────────────────────

export async function getParentTasks() {
  return prisma.parentTask.findMany({
    include: { subTasks: true },
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

// ─── Create ────────────────────────────────────────────────────────────────

export async function createParentTask(name: string) {
  await prisma.parentTask.create({ data: { name } });
  revalidatePath("/");
}

export async function createSubTask(parent_task_id: string, name: string) {
  await prisma.subTask.create({ data: { parent_task_id, name } });
  revalidatePath("/");
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
  end_time: Date,
  duration: number
) {
  const session = await prisma.session.findUnique({ where: { id: session_id } });
  if (!session) return;

  const durationDiff = duration - session.duration;

  await prisma.session.update({
    where: { id: session_id },
    data: { start_time, end_time, duration },
  });

  await prisma.subTask.update({
    where: { id: session.sub_task_id },
    data: { total_cumulative_time: { increment: durationDiff } },
  });

  const subTask = await prisma.subTask.findUnique({ where: { id: session.sub_task_id } });
  if (subTask) {
    await prisma.parentTask.update({
      where: { id: subTask.parent_task_id },
      data: { total_cumulative_time: { increment: durationDiff } },
    });
  }

  revalidatePath("/");
}

// ─── Delete ────────────────────────────────────────────────────────────────

export async function deleteParentTask(id: string) {
  // Cascade: Prisma schema handles sub-tasks and sessions via onDelete: Cascade
  await prisma.parentTask.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteSubTask(id: string) {
  // First recalculate parent cumulative time
  const subTask = await prisma.subTask.findUnique({ where: { id } });
  if (subTask && subTask.total_cumulative_time > 0) {
    await prisma.parentTask.update({
      where: { id: subTask.parent_task_id },
      data: { total_cumulative_time: { decrement: subTask.total_cumulative_time } },
    });
  }
  await prisma.subTask.delete({ where: { id } });
  revalidatePath("/");
}

export async function deleteSession(session_id: string) {
  const session = await prisma.session.findUnique({ where: { id: session_id } });
  if (!session) return;

  // Only subtract duration from cumulative if the session was completed
  if (session.end_time && session.duration > 0) {
    await prisma.subTask.update({
      where: { id: session.sub_task_id },
      data: { total_cumulative_time: { decrement: session.duration } },
    });

    const subTask = await prisma.subTask.findUnique({ where: { id: session.sub_task_id } });
    if (subTask) {
      await prisma.parentTask.update({
        where: { id: subTask.parent_task_id },
        data: { total_cumulative_time: { decrement: session.duration } },
      });
    }
  }

  await prisma.session.delete({ where: { id: session_id } });
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
  const session = await prisma.session.findUnique({ where: { id: session_id } });
  if (!session || session.end_time) return;
  const end_time = new Date();
  const duration = Math.round((end_time.getTime() - session.start_time.getTime()) / 1000);

  const updatedSession = await prisma.session.update({
    where: { id: session_id },
    data: { end_time, duration },
  });

  // Update cumulative times
  await prisma.subTask.update({
    where: { id: session.sub_task_id },
    data: { total_cumulative_time: { increment: duration } },
  });

  const subTask = await prisma.subTask.findUnique({ where: { id: session.sub_task_id } });
  if (subTask) {
    await prisma.parentTask.update({
      where: { id: subTask.parent_task_id },
      data: { total_cumulative_time: { increment: duration } },
    });
  }

  revalidatePath("/");
  return updatedSession;
}
