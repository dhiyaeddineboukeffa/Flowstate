import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ParentTask, Session, FullParentTask, StoreFullSession } from "@/types";

interface SyncOperation {
  id: string;
  action: string;
  payload: any;
  timestamp: number;
}

// ─── Debounced localStorage adapter ────────────────────────────────────────
// Instead of writing to localStorage on every micro-update (which blocks the
// main thread with JSON.stringify of the entire state), we debounce writes
// so that rapid-fire state updates (like stopping a timer) only trigger ONE
// serialization + write after all updates have settled.
let pendingWrite: ReturnType<typeof setTimeout> | null = null;
let writeCache: Record<string, string> = {};

const debouncedStorage: StateStorage = {
  getItem: (name: string) => {
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    writeCache[name] = value;
    if (pendingWrite) clearTimeout(pendingWrite);
    pendingWrite = setTimeout(() => {
      for (const [k, v] of Object.entries(writeCache)) {
        localStorage.setItem(k, v);
      }
      writeCache = {};
      pendingWrite = null;
    }, 150); // Wait 150ms for all state updates to settle, then write once
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

interface FlowState {
  tasks: FullParentTask[];
  activeSessions: StoreFullSession[];
  todaySessions: Session[];
  pomodoroState: any;
  recentSubTaskIds: string[];
  syncQueue: SyncOperation[];
  
  // Initialize from server props if empty
  initialize: (data: Partial<FlowState>) => void;
  
  // Actions
  setTasks: (tasks: FullParentTask[] | ((prev: FullParentTask[]) => FullParentTask[])) => void;
  setActiveSessions: (sessions: StoreFullSession[] | ((prev: StoreFullSession[]) => StoreFullSession[])) => void;
  setTodaySessions: (sessions: Session[] | ((prev: Session[]) => Session[])) => void;
  updatePomodoroState: (state: Partial<any>) => void;
  setRecentSubTaskIds: (ids: string[]) => void;
  
  // Queue operations
  pushSyncOperation: (action: string, payload: any) => void;
  removeSyncOperations: (ids: string[]) => void;

  // ─── Composite batch actions ───────────────────────────────────────────
  // These update multiple slices of state in a SINGLE set() call,
  // so Zustand's persist middleware only serializes + writes ONCE.
  
  batchStopSession: (params: {
    sessionId: string;
    stoppedSession: any;
    subTaskId: string;
    duration: number;
  }) => void;

  batchStartSession: (params: {
    fakeSession: any;
  }) => void;
}

function makeSyncOp(action: string, payload: any): SyncOperation {
  return {
    id: Math.random().toString(36).substring(7),
    action,
    payload,
    timestamp: Date.now(),
  };
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      tasks: [],
      activeSessions: [],
      todaySessions: [],
      pomodoroState: {
        pomodoroMode: false,
        workDuration: 25,
        shortBreakDuration: 5,
        longBreakDuration: 15,
        sessionsBeforeLongBreak: 4,
        pomodoroPhase: "work",
        pomodorosCompleted: 0,
        breakStartTime: null,
        pomodoroAccumulated: 0,
      },
      recentSubTaskIds: [],
      syncQueue: [],
      
      initialize: (data) => set((state) => {
        const safeData: any = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined) safeData[k] = v;
        }
        if (!state.tasks || state.tasks.length === 0) {
          return { ...state, ...safeData };
        }
        return state;
      }),
      
      setTasks: (updater) => set((state) => ({
        tasks: typeof updater === 'function' ? updater(state.tasks) : updater
      })),
      
      setActiveSessions: (updater) => set((state) => ({
        activeSessions: typeof updater === 'function' ? updater(state.activeSessions) : updater
      })),
      
      setTodaySessions: (updater) => set((state) => ({
        todaySessions: typeof updater === 'function' ? updater(state.todaySessions) : updater
      })),
      
      updatePomodoroState: (updater) => set((state) => ({
        pomodoroState: { ...state.pomodoroState, ...updater }
      })),
      
      setRecentSubTaskIds: (ids) => set({ recentSubTaskIds: ids }),
      
      pushSyncOperation: (action, payload) => set((state) => ({
        syncQueue: [
          ...state.syncQueue,
          makeSyncOp(action, payload)
        ]
      })),
      
      removeSyncOperations: (ids) => set((state) => ({
        syncQueue: state.syncQueue.filter(op => !ids.includes(op.id))
      })),

      // ─── Composite: Stop a session ──────────────────────────────────────
      // Updates activeSessions, todaySessions, tasks, and syncQueue in ONE set().
      batchStopSession: ({ sessionId, stoppedSession, subTaskId, duration }) => set((state) => {
        const newActiveSessions = state.activeSessions.filter(s => s.id !== sessionId);
        const newTodaySessions = [stoppedSession as any, ...state.todaySessions];
        const newTasks = state.tasks.map(pt => {
          let updatedPt = false;
          const newSubTasks = pt.subTasks?.map((st: any) => {
            if (st.id === subTaskId) {
              updatedPt = true;
              return { ...st, total_cumulative_time: (st.total_cumulative_time || 0) + duration };
            }
            return st;
          });
          if (updatedPt) {
            return { ...pt, total_cumulative_time: (pt.total_cumulative_time || 0) + duration, subTasks: newSubTasks };
          }
          return pt;
        });
        const newSyncQueue = [...state.syncQueue, makeSyncOp("stopSession", sessionId)];

        return {
          activeSessions: newActiveSessions,
          todaySessions: newTodaySessions,
          tasks: newTasks,
          syncQueue: newSyncQueue,
        };
      }),

      // ─── Composite: Start a session ─────────────────────────────────────
      batchStartSession: ({ fakeSession }) => set((state) => ({
        activeSessions: [...state.activeSessions, fakeSession as any],
        syncQueue: [
          ...state.syncQueue,
          makeSyncOp("startSession", { subTaskId: fakeSession.sub_task_id, sessionId: fakeSession.id })
        ],
      })),
    }),
    {
      name: 'flowstate-storage',
      storage: createJSONStorage(() => debouncedStorage),
    }
  )
);
