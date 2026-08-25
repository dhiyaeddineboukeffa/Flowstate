"use server";

import getMongoClient from "./mongodb";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ObjectId, WithId, Document } from "mongodb";

function toMongoId(id: string): any {
  if (ObjectId.isValid(id) && (id.length === 12 || id.length === 24)) {
    return new ObjectId(id);
  }
  return id;
}

async function getDb() {
  const client = await getMongoClient();
  return client.db("flowstate");
}

function mapId(doc: any) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

function mapIds(docs: any[]) {
  return docs.map(mapId);
}

// --- Auth ---

async function getUserId() {
  const cookieStore = await cookies();
  const userId = cookieStore.get("fs_userid")?.value;
  if (!userId) throw new Error("Unauthorized");
  // Legacy user IDs are UUIDs, so we don't strictly validate ObjectId format here.
  return userId;
}

export async function loginUser(username: string) {
  try {
    const uname = username.trim().toLowerCase();
    const db = await getDb();
    
    let user = await db.collection("User").findOne({ username: uname });
    
    if (!user) {
      const res = await db.collection("User").insertOne({
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
        pomodoroAccumulated: 0,
      });
      user = { _id: res.insertedId, username: uname };
    }
    
    const cookieStore = await cookies();
    const isProd = process.env.NODE_ENV === "production" && process.env.VERCEL === "1";
    cookieStore.set("fs_userid", user._id.toString(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      secure: isProd,
    });
    cookieStore.set("fs_username", user.username, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      secure: isProd,
    });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || String(e) };
  }
}

export async function logoutUser() {
  const cookieStore = await cookies();
  cookieStore.delete("fs_userid");
  cookieStore.delete("fs_username");
}

// --- Read ---

export async function getParentTasks() {
  const userId = await getUserId();
  const db = await getDb();
  
  const tasks = await db.collection("ParentTask").find({ user_id: toMongoId(userId) }).sort({ created_at: 1 }).toArray();
  const subTasks = await db.collection("SubTask").find({ parent_task_id: { $in: tasks.map(t => t._id) } }).toArray();
  const checklists = await db.collection("ChecklistItem").find({ sub_task_id: { $in: subTasks.map(s => s._id) } }).sort({ created_at: 1 }).toArray();
  
  const formattedTasks = tasks.map(t => ({
    ...mapId(t),
    subTasks: subTasks.filter(s => s.parent_task_id.toString() === t._id.toString()).map(s => ({
      ...mapId(s),
      checklists: checklists.filter(c => c.sub_task_id.toString() === s._id.toString()).map(mapId)
    }))
  }));
  
  return formattedTasks;
}

export async function getActiveSessions() {
  const userId = await getUserId();
  const db = await getDb();
  
  const userParents = await db.collection("ParentTask").find({ user_id: toMongoId(userId) }).toArray();
  const userSubTasks = await db.collection("SubTask").find({ parent_task_id: { $in: userParents.map(p => p._id) } }).toArray();
  const subTaskIds = userSubTasks.map(s => s._id);
  
  const sessions = await db.collection("Session").find({ 
    end_time: null,
    sub_task_id: { $in: subTaskIds }
  }).toArray();
  
  const checklists = await db.collection("ChecklistItem").find({ sub_task_id: { $in: subTaskIds } }).toArray();
  
  const formattedSessions = sessions.map(s => {
    const sub = userSubTasks.find(sub => sub._id.toString() === s.sub_task_id.toString());
    const parent = userParents.find(p => p._id.toString() === sub?.parent_task_id.toString());
    return {
      ...mapId(s),
      subTask: {
        ...mapId(sub),
        parentTask: mapId(parent),
        checklists: checklists.filter(c => c.sub_task_id.toString() === sub?._id.toString()).map(mapId)
      }
    };
  });
  
  return formattedSessions;
}

export async function getSubTaskSessions(sub_task_id: string) {
  const userId = await getUserId();
  const db = await getDb();
  
  const subTask = await db.collection("SubTask").findOne({ _id: toMongoId(sub_task_id) });
  if (!subTask) return [];
  const parentTask = await db.collection("ParentTask").findOne({ _id: subTask.parent_task_id, user_id: toMongoId(userId) });
  if (!parentTask) return [];

  const sessions = await db.collection("Session").find({
    sub_task_id: toMongoId(sub_task_id),
    end_time: { $ne: null }
  }).sort({ start_time: -1 }).toArray();
  
  return mapIds(sessions);
}

export async function getRecentSubTaskIds() {
  const userId = await getUserId();
  const db = await getDb();
  
  const userParents = await db.collection("ParentTask").find({ user_id: toMongoId(userId) }).toArray();
  const userSubTasks = await db.collection("SubTask").find({ parent_task_id: { $in: userParents.map(p => p._id) } }).toArray();
  
  const recentSessions = await db.collection("Session").find({
    sub_task_id: { $in: userSubTasks.map(s => s._id) }
  }).sort({ start_time: -1 }).limit(50).project({ sub_task_id: 1 }).toArray();
  
  const uniqueIds = Array.from(new Set(recentSessions.map(s => s.sub_task_id.toString()))).slice(0, 4);
  return uniqueIds;
}

export async function getTodaySessions() {
  const userId = await getUserId();
  const db = await getDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const userParents = await db.collection("ParentTask").find({ user_id: toMongoId(userId) }).toArray();
  const userSubTasks = await db.collection("SubTask").find({ parent_task_id: { $in: userParents.map(p => p._id) } }).toArray();
  
  const sessions = await db.collection("Session").find({
    start_time: { $gte: today },
    end_time: { $ne: null },
    sub_task_id: { $in: userSubTasks.map(s => s._id) }
  }).sort({ start_time: -1 }).toArray();
  
  return sessions.map(s => ({
    ...mapId(s),
    subTask: mapId(userSubTasks.find(sub => sub._id.toString() === s.sub_task_id.toString()))
  }));
}

// --- Create ---

export async function createParentTask(name: string, client_id?: string) {
  const userId = await getUserId();
  const db = await getDb();
  
  const doc = {
    user_id: toMongoId(userId),
    name,
    general_notes: null,
    total_cumulative_time: 0,
    created_at: new Date()
  };
  const res = await db.collection("ParentTask").insertOne(doc);
  
  return { ...mapId({ _id: res.insertedId, ...doc }), subTasks: [] };
}

export async function createSubTask(parent_task_id: string, name: string, client_id?: string) {
  await getUserId();
  const db = await getDb();
  
  const doc = {
    parent_task_id: toMongoId(parent_task_id),
    name,
    total_cumulative_time: 0,
    created_at: new Date()
  };
  const res = await db.collection("SubTask").insertOne(doc);
  
  return mapId({ _id: res.insertedId, ...doc });
}

// --- Update ---

export async function renameParentTask(id: string, name: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("ParentTask").updateOne({ _id: toMongoId(id) }, { $set: { name } });
  
}

export async function renameSubTask(id: string, name: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("SubTask").updateOne({ _id: toMongoId(id) }, { $set: { name } });
  
}

export async function updateParentTaskNotes(id: string, notes: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("ParentTask").updateOne({ _id: toMongoId(id) }, { $set: { general_notes: notes } });
  
}

export async function updateSessionNotes(id: string, notes: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("Session").updateOne({ _id: toMongoId(id) }, { $set: { session_notes: notes } });
  
}

export async function updateSessionTime(
  session_id: string,
  start_time: Date,
  end_time: Date | null,
  duration: number
) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection("Session").findOne({ _id: toMongoId(session_id) });
  if (!session) return;

  const durationDiff = duration - session.duration;

  await db.collection("Session").updateOne(
    { _id: toMongoId(session_id) },
    { $set: { start_time, end_time, duration } }
  );

  if (durationDiff !== 0) {
    const subTask = await db.collection("SubTask").findOne({ _id: session.sub_task_id });
    if (subTask) {
      await db.collection("SubTask").updateOne(
        { _id: session.sub_task_id },
        { $inc: { total_cumulative_time: durationDiff } }
      );
      await db.collection("ParentTask").updateOne(
        { _id: subTask.parent_task_id },
        { $inc: { total_cumulative_time: durationDiff } }
      );
    }
  }

  
}

// --- Delete ---

export async function deleteParentTask(id: string) {
  await getUserId();
  const db = await getDb();
  // Cascade delete manually since MongoDB doesn't have cascade
  const subTasks = await db.collection("SubTask").find({ parent_task_id: toMongoId(id) }).toArray();
  const subTaskIds = subTasks.map(s => s._id);
  
  await db.collection("ChecklistItem").deleteMany({ sub_task_id: { $in: subTaskIds } });
  await db.collection("Session").deleteMany({ sub_task_id: { $in: subTaskIds } });
  await db.collection("SubTask").deleteMany({ parent_task_id: toMongoId(id) });
  await db.collection("ParentTask").deleteOne({ _id: toMongoId(id) });
  
  
}

export async function deleteSubTask(id: string) {
  await getUserId();
  const db = await getDb();
  
  const subTask = await db.collection("SubTask").findOne({ _id: toMongoId(id) });
  if (subTask && subTask.total_cumulative_time > 0) {
    await db.collection("ParentTask").updateOne(
      { _id: subTask.parent_task_id },
      { $inc: { total_cumulative_time: -subTask.total_cumulative_time } }
    );
  }
  
  await db.collection("ChecklistItem").deleteMany({ sub_task_id: toMongoId(id) });
  await db.collection("Session").deleteMany({ sub_task_id: toMongoId(id) });
  await db.collection("SubTask").deleteOne({ _id: toMongoId(id) });
  
  
}

export async function deleteSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection("Session").findOne({ _id: toMongoId(session_id) });
  if (!session) return;

  if (session.end_time && session.duration > 0) {
    const subTask = await db.collection("SubTask").findOne({ _id: session.sub_task_id });
    if (subTask) {
      await db.collection("SubTask").updateOne(
        { _id: session.sub_task_id },
        { $inc: { total_cumulative_time: -session.duration } }
      );
      await db.collection("ParentTask").updateOne(
        { _id: subTask.parent_task_id },
        { $inc: { total_cumulative_time: -session.duration } }
      );
    }
  }

  await db.collection("Session").deleteOne({ _id: toMongoId(session_id) });
  
}

// --- Timer ---

export async function startSession(sub_task_id: string, client_id?: string) {
  await getUserId();
  const db = await getDb();
  
  const doc = {
    sub_task_id: toMongoId(sub_task_id),
    start_time: new Date(),
    end_time: null,
    duration: 0,
    session_notes: null,
    is_paused: false,
    last_paused_at: null,
    accumulated_paused_time: 0
  };
  const res = await db.collection("Session").insertOne(doc);
  
  
  return mapId({ _id: res.insertedId, ...doc });
}

export async function stopSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  
  const session = await db.collection("Session").findOne({ _id: toMongoId(session_id) });
  if (!session || session.end_time) return;
  
  const end_time = new Date();
  const elapsedTotal = Math.round((end_time.getTime() - session.start_time.getTime()) / 1000);
  let duration = Math.max(0, elapsedTotal - session.accumulated_paused_time);
  
  if (session.is_paused && session.last_paused_at) {
    const finalPauseTime = Math.round((end_time.getTime() - session.last_paused_at.getTime()) / 1000);
    duration = Math.max(0, duration - finalPauseTime);
  }

  await db.collection("Session").updateOne(
    { _id: toMongoId(session_id) },
    { $set: { end_time, duration, is_paused: false, last_paused_at: null } }
  );

  const subTask = await db.collection("SubTask").findOne({ _id: session.sub_task_id });
  if (subTask) {
    await db.collection("SubTask").updateOne(
      { _id: session.sub_task_id },
      { $inc: { total_cumulative_time: duration } }
    );
    await db.collection("ParentTask").updateOne(
      { _id: subTask.parent_task_id },
      { $inc: { total_cumulative_time: duration } }
    );
  }

  
}

export async function pauseSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("Session").updateOne(
    { _id: toMongoId(session_id) },
    { $set: { is_paused: true, last_paused_at: new Date() } }
  );
  
}

export async function resumeSession(session_id: string) {
  await getUserId();
  const db = await getDb();
  const session = await db.collection("Session").findOne({ _id: toMongoId(session_id) });
  if (!session || !session.is_paused || !session.last_paused_at) return;
  
  const now = new Date();
  const pausedDuration = Math.round((now.getTime() - session.last_paused_at.getTime()) / 1000);
  
  await db.collection("Session").updateOne(
    { _id: toMongoId(session_id) },
    { 
      $set: { is_paused: false, last_paused_at: null },
      $inc: { accumulated_paused_time: pausedDuration }
    }
  );
  
}

// --- Checklists ---

export async function createChecklistItem(sub_task_id: string, text: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("ChecklistItem").insertOne({
    sub_task_id: toMongoId(sub_task_id),
    text,
    done: false,
    created_at: new Date()
  });
  
}

export async function toggleChecklistItem(id: string, done: boolean) {
  await getUserId();
  const db = await getDb();
  await db.collection("ChecklistItem").updateOne(
    { _id: toMongoId(id) },
    { $set: { done } }
  );
  
}

export async function deleteChecklistItem(id: string) {
  await getUserId();
  const db = await getDb();
  await db.collection("ChecklistItem").deleteOne({ _id: toMongoId(id) });
  
}

// --- User Pomodoro State ---

export async function getUserPomodoroState() {
  const userId = await getUserId();
  const db = await getDb();
  const user = await db.collection("User").findOne({ _id: toMongoId(userId) });
  return mapId(user);
}

export async function updateUserPomodoroState(data: any) {
  const userId = await getUserId();
  const db = await getDb();
  await db.collection("User").updateOne(
    { _id: toMongoId(userId) },
    { $set: data }
  );
  
}

export async function fetchAllData() {
  const [tasks, activeSessions, todaySessions, pomodoroState, recentSubTaskIds] = await Promise.all([
    getParentTasks(),
    getActiveSessions(),
    getTodaySessions(),
    getUserPomodoroState(),
    getRecentSubTaskIds()
  ]);
  return { tasks, activeSessions, todaySessions, pomodoroState, recentSubTaskIds };
}
