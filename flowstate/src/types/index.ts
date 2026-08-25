export interface User {
  id: string;
  username: string;
  created_at: Date;
  pomodoroMode: boolean;
  workDuration: number;
  shortBreakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLongBreak: number;
  pomodoroPhase: string;
  pomodorosCompleted: number;
  breakStartTime: Date | null;
  pomodoroAccumulated: number;
}

export interface ParentTask {
  id: string;
  user_id: string | null;
  name: string;
  general_notes: string | null;
  total_cumulative_time: number;
  created_at: Date;
}

export interface SubTask {
  id: string;
  parent_task_id: string;
  name: string;
  total_cumulative_time: number;
  created_at: Date;
}

export interface ChecklistItem {
  id: string;
  sub_task_id: string;
  text: string;
  done: boolean;
  created_at: Date;
}

export interface Session {
  id: string;
  sub_task_id: string;
  start_time: Date;
  end_time: Date | null;
  duration: number;
  session_notes: string | null;
  is_paused: boolean;
  last_paused_at: Date | null;
  accumulated_paused_time: number;
}


export type FullSubTask = SubTask & { checklists: ChecklistItem[] };
export type FullParentTask = ParentTask & { subTasks: FullSubTask[] };
export type StoreFullSession = Session & { parent_task_id: string; parent_name: string; sub_name: string };
