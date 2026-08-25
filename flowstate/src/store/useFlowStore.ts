import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ParentTask, Session, FullParentTask, StoreFullSession } from "@/types"; // Ensure these types exist or update them

interface SyncOperation {
  id: string;
  action: string;
  payload: any;
  timestamp: number;
}

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
          {
            id: Math.random().toString(36).substring(7),
            action,
            payload,
            timestamp: Date.now()
          }
        ]
      })),
      
      removeSyncOperations: (ids) => set((state) => ({
        syncQueue: state.syncQueue.filter(op => !ids.includes(op.id))
      }))
    }),
    {
      name: 'flowstate-storage',
    }
  )
);
