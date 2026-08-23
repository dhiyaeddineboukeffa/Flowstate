"use server";

import { getDb } from "./mongo";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";

// Helper to map _id to id
function mapId(doc: any) {
  if (!doc) return doc;
  if (doc._id) {
    doc.id = doc._id;
  }
  return doc;
}

// "?"?"? Auth "?"?"?

async function getUserId() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

export async function loginUser(username: string) {
  const uname = username.trim().toLowerCase();
  const db = await getDb();
  let user = await db.collection<any>("User").findOne({ username: uname });
  if (!user) {
    user = {
      _id: uuidv4(),
      username: uname,
      created_at: new Date(),
      pomodoroMode: false,
      workDuration: 25,
      shortBreakDuration: 5,
      longBreakDuration: 15,
      sessionsBeforeLongBreak: 4,
      pomodoroPhase: "work",
      pomodorosCompleted: 0,
      breakStartTime: null,
      pomodoroAccumulated: 0
    };
    await db.collection<any>("User").insertOne(user as any);
  }
  const cookieStore = await cookies();
  cookieStore.set("fs_userid", user._id, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  cookieStore.set("fs_username", user.username, { path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("fs_userid");
  cookieStore.delete("fs_username");
}

// "?"?"? Read "?"?"?

export async function getParentTasks() {
  const userId = await getUserId();
  const db = await getDb();
  const tasks = await db.collection<any>("ParentTask").find({ user_id: userId }).sort({ created_at: 1 }).toArray();
  const subTasks = await db.collection<any>("SubTask").find({ parent_task_id: { $in: tasks.map(t => t._id) } }).toArray();
  const checklists = await db.collection<any>("ChecklistItem").find({ sub_task_id: { $in: subTasks.map(s => s._id) } }).sort({ created_at: 1 }).toArray();

  const subTasksMap = new Map();
  subTasks.forEach(st => {
    st.checklists = checklists.filter(c => c.sub_task_id === st._id).map(mapId);
    if (!subTasksMap.has(st.parent_task_id)) subTasksMap.set(st.parent_task_id, []);
    subTasksMap.get(st.parent_task_id).push(mapId(st));
  });

  return tasks.map(t => {
    t.subTasks = subTasksMap.get(t._id) || [];
    return mapId(t);
  });
}

export async function getActiveSessions() {
  const userId = await getUserId();
  const db = await getDb();
  
  const tasks = await db.collection<any>("ParentTask").find({ user_id: userId }).toArray();
  const taskIds = tasks.map(t => t._id);
  const subTasks = await db.collection<any>("SubTask").find({ parent_task_id: { $in: taskIds } }).toArray();
  const subTaskIds = subTasks.map(st => st._id);
  
  const sessions = await db.collection<any>("Session").find({ end_time: null, sub_task_id: { $in: subTaskIds } }).toArray();
  const checklists = await db.collection<any>("ChecklistItem").find({ sub_task_id: { $in: subTaskIds } }).toArray();

  return sessions.map(s => {
    const st = subTasks.find(x => x._id === s.sub_task_id);
    if (st) {
      const parent = tasks.find(x => x._id === st.parent_task_id);
      const cls = checklists.filter(x => x.sub_task_id === st._id);
      s.subTask = mapId({ ...st, parentTask: mapId(parent), checklists: cls.map(mapId) });
    }
    return mapId(s);
  });
}

export async function getSubTaskSessions(sub_task_id: string) {
  const userId = await getUserId();
  const db = await getDb();
  
  const st = await db.collection<any>("SubTask").findOne({ _id: sub_task_id });
  if (!st) return [];
  const pt = await db.collection<any>("ParentTask").findOne({ _id: st.parent_task_id, user_id: userId });
  if (!pt) return [];
  
  const sessions = await db.collection<any>("Session").find({ sub_task_id, end_time: { $ne: null } }).sort({ start_time: -1 }).toArray();
  return sessions.map(mapId);
}

export async function getRecentSubTaskIds() {
  const userId = await getUserId();
  const db = await getDb();
  
  const tasks = await db.collection<any>("ParentTask").find({ user_id: userId }).toArray();
  const taskIds = tasks.map(t => t._id);
  const subTasks = await db.collection<any>("SubTask").find({ parent_task_id: { $in: taskIds } }).toArray();
  const subTaskIds = subTasks.map(st => st._id);
  
  const recentSessions = await db.collection<any>("Session").find({ sub_task_id: { $in: subTaskIds } }).sort({ start_time: -1 }).limit(50).toArray();
  return Array.from(new Set(recentSessions.map(s => s.sub_task_id))).slice(0, 4);
}

export async function getTodaySessions() {
  const userId = await getUserId();
  const db = await getDb();
  
  const tasks = await db.collection<any>("ParentTask").find({ user_id: userId }).toArray();
  const taskIds = tasks.map(t => t._id);
  const subTasks = await db.collection<any>("SubTask").find({ parent_task_id: { $in: taskIds } }).toArray();
  const subTaskIds = subTasks.map(st => st._id);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const sessions = await db.collection<any>("Session").find({
    start_time: { $gte: today },
    end_time: { $ne: null },
    sub_task_id: { $in: subTaskIds }
  }).sort({ start_time: -1 }).toArray();
  
  return sessions.map(mapId);
}

// "?"?"? Create "?"?"?

export async function createParentTask(name: string) {
  const userId = await getUserId();
  const db = await getDb();
  
  const newTask = {
    _id: uuidv4(),
    user_id: userId,
    name,
    general_notes: null,
    total_cumulative_time: 0,
    created_at: new Date(),
  };
  await db.collection<any>("ParentTask").insertOne(newTask as any);
  
  revalidatePath("/");
  return mapId({ ...newTask, subTasks: [] });
}

export async function createSubTask(parent_task_id: string, name: string) {
  await getUserId();
  const db = await getDb();
  
  const newSubTask = {
    _id: uuidv4(),
    parent_task_id,
    name,
    total_cumulative_time: 0,
    created_at: new Date(),
  };
  await db.collection<any>("SubTask").insertOne(newSubTask as any);
  
  revalidatePath("/");
  return mapId(newSubTask);
}

// "?"?"? Update "?"?"?

export async function renameParentTask(id: string, name: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("ParentTask").updateOne({ _id: id }, { $set: { name } });
  revalidatePath("/");
}

export async function renameSubTask(id: string, name: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("SubTask").updateOne({ _id: id }, { $set: { name } });
  revalidatePath("/");
}

export async function updateParentTaskNotes(id: string, notes: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("ParentTask").updateOne({ _id: id }, { $set: { general_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionNotes(id: string, notes: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("Session").updateOne({ _id: id }, { $set: { session_notes: notes } });
  revalidatePath("/");
}

export async function updateSessionTime(
  session_id: string,
  start_time: Date,
  end_time: Date | null,
  duration: number
) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection<any>("Session").findOne({ _id: session_id });
  if (!session) return;

  const durationDiff = duration - session.duration;

  await db.collection<any>("Session").updateOne({ _id: session_id }, { $set: { start_time, end_time, duration } });

  if (durationDiff !== 0) {
    const subTask = await db.collection<any>("SubTask").findOne({ _id: session.sub_task_id });
    if (subTask) {
      await db.collection<any>("SubTask").updateOne({ _id: session.sub_task_id }, { $inc: { total_cumulative_time: durationDiff } });
      await db.collection<any>("ParentTask").updateOne({ _id: subTask.parent_task_id }, { $inc: { total_cumulative_time: durationDiff } });
    }
  }

  revalidatePath("/");
}

// "?"?"? Delete "?"?"?

export async function deleteParentTask(id: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("ParentTask").deleteOne({ _id: id });
  revalidatePath("/");
}

export async function deleteSubTask(id: string) {
  await getUserId();
  const db = await getDb();
  
  const subTask = await db.collection<any>("SubTask").findOne({ _id: id });
  if (subTask && subTask.total_cumulative_time > 0) {
    await db.collection<any>("ParentTask").updateOne({ _id: subTask.parent_task_id }, { $inc: { total_cumulative_time: -subTask.total_cumulative_time } });
  }
  await db.collection<any>("SubTask").deleteOne({ _id: id });
  
  revalidatePath("/");
}

export async function deleteSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection<any>("Session").findOne({ _id: session_id });
  if (!session) return;

  if (session.end_time && session.duration > 0) {
    const subTask = await db.collection<any>("SubTask").findOne({ _id: session.sub_task_id });
    if (subTask) {
      await db.collection<any>("SubTask").updateOne({ _id: session.sub_task_id }, { $inc: { total_cumulative_time: -session.duration } });
      await db.collection<any>("ParentTask").updateOne({ _id: subTask.parent_task_id }, { $inc: { total_cumulative_time: -session.duration } });
    }
  }

  await db.collection<any>("Session").deleteOne({ _id: session_id });
  revalidatePath("/");
}

// "?"?"? Timer "?"?"?

export async function startSession(sub_task_id: string) {
  await getUserId();
  const db = await getDb();
  
  const session = {
    _id: uuidv4(),
    sub_task_id,
    start_time: new Date(),
    end_time: null,
    duration: 0,
    session_notes: null,
    is_paused: false,
    last_paused_at: null,
    accumulated_paused_time: 0
  };
  await db.collection<any>("Session").insertOne(session as any);
  
  revalidatePath("/");
  return mapId(session);
}

export async function stopSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection<any>("Session").findOne({ _id: session_id });
  if (!session || session.end_time) return;
  
  const end_time = new Date();
  const elapsedTotal = Math.round((end_time.getTime() - session.start_time.getTime()) / 1000);
  let duration = Math.max(0, elapsedTotal - session.accumulated_paused_time);
  
  if (session.is_paused && session.last_paused_at) {
    const finalPauseTime = Math.round((end_time.getTime() - session.last_paused_at.getTime()) / 1000);
    duration = Math.max(0, duration - finalPauseTime);
  }

  await db.collection<any>("Session").updateOne({ _id: session_id }, {
    $set: { end_time, duration, is_paused: false, last_paused_at: null }
  });

  const subTask = await db.collection<any>("SubTask").findOne({ _id: session.sub_task_id });
  if (subTask) {
    await db.collection<any>("SubTask").updateOne({ _id: session.sub_task_id }, { $inc: { total_cumulative_time: duration } });
    await db.collection<any>("ParentTask").updateOne({ _id: subTask.parent_task_id }, { $inc: { total_cumulative_time: duration } });
  }

  revalidatePath("/");
}

export async function pauseSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("Session").updateOne({ _id: session_id }, {
    $set: { is_paused: true, last_paused_at: new Date() }
  });
  revalidatePath("/");
}

export async function resumeSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  const session = await db.collection<any>("Session").findOne({ _id: session_id });
  if (!session || !session.is_paused || !session.last_paused_at) return;
  
  const now = new Date();
  const pausedDuration = Math.round((now.getTime() - session.last_paused_at.getTime()) / 1000);
  
  await db.collection<any>("Session").updateOne({ _id: session_id }, {
    $set: { is_paused: false, last_paused_at: null },
    $inc: { accumulated_paused_time: pausedDuration }
  });
  revalidatePath("/");
}

// "?"?"? Checklists "?"?"?

export async function createChecklistItem(sub_task_id: string, text: string) {
  await getUserId();
  const db = await getDb();
  const item = {
    _id: uuidv4(),
    sub_task_id,
    text,
    done: false,
    created_at: new Date(),
  };
  await db.collection<any>("ChecklistItem").insertOne(item as any);
  revalidatePath("/");
}

export async function toggleChecklistItem(id: string, done: boolean) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("ChecklistItem").updateOne({ _id: id }, { $set: { done } });
  revalidatePath("/");
}

export async function deleteChecklistItem(id: string) {
  await getUserId();
  const db = await getDb();
  await db.collection<any>("ChecklistItem").deleteOne({ _id: id });
  revalidatePath("/");
}

// "?"?"? User Pomodoro State "?"?"?

export async function getUserPomodoroState() {
  const userId = await getUserId();
  const db = await getDb();
  const user = await db.collection<any>("User").findOne({ _id: userId });
  return mapId(user);
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
  const db = await getDb();
  await db.collection<any>("User").updateOne({ _id: userId }, { $set: data });
  revalidatePath("/");
}
