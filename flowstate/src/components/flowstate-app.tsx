"use client";
import { fetchAllData, loginUser } from "@/lib/actions";
import { useFlowStore } from "@/store/useFlowStore";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { ParentTask, SubTask, Session, ChecklistItem, FullParentTask, FullSubTask } from "@/types";
import {
  startSession,
  stopSession,
  pauseSession,
  resumeSession,
  createParentTask,
  createSubTask,
  renameParentTask,
  renameSubTask,
  deleteParentTask,
  deleteSubTask,
  deleteSession,
  updateParentTaskNotes,
  updateSessionNotes,
  updateSessionTime,
  getSubTaskSessions,
  createChecklistItem,
  toggleChecklistItem,
  deleteChecklistItem,
  logoutUser,
  getUserPomodoroState,
  updateUserPomodoroState,
} from "@/lib/actions";
import { cn } from "@/lib/utils";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { SnailTimer } from "./ui/snail-timer";
import { AnimatedGradient } from "./ui/animated-gradient";
import { UnifiedTimeWheelPicker, TimerMode } from "./ui/radial-time-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { toast } from "sonner";
import {
  Play,
  Square,
  Plus,
  ArrowLeft,
  Timer,
  Pencil,
  Trash2,
  Clock,
  FolderOpen,
  FileText,
  MoreHorizontal,
  Settings,
  ChevronRight,
  X,
  FastForward,
  Pause,
  Flame,
  Zap,
  BarChart3,
  CheckSquare,
  Check,
  MessageSquare,
  LogOut,
  Sun,
  Moon,
  ArrowUpDown,
} from "lucide-react";



type FullSession = Session & { subTask: FullSubTask & { parentTask: ParentTask } };

let sharedAudioContext: AudioContext | null = null;
const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  if (!sharedAudioContext) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) sharedAudioContext = new AudioContextClass();
  }
  if (sharedAudioContext && sharedAudioContext.state === "suspended") {
    sharedAudioContext.resume().catch(() => {});
  }
  return sharedAudioContext;
};

type View =
  | { kind: "projects" }
  | { kind: "project"; parent: FullParentTask }
  | { kind: "timer"; parent: FullParentTask; sub: any };

// Helper to format minutes to HH:MM
const formatMinsToHHMM = (mins: number) => {
  const h = Math.floor(mins / 60).toString().padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

// Helper to parse HH:MM to minutes
const parseHHMMToMins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatShort(seconds: number): string {
  if (seconds === 0) return "0m";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function FlowStateApp({
  initialTasks,
  initialActiveSessions,
  initialTodaySessions,
  initialPomodoroState,
  initialRecentSubTaskIds,
  username,
}: {
  initialTasks?: FullParentTask[];
  initialActiveSessions?: FullSession[];
  initialTodaySessions?: Session[];
  initialPomodoroState?: any;
  initialRecentSubTaskIds?: string[];
  username: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const store = useFlowStore();
  const tasks = store.tasks || [];
  const setTasks = store.setTasks;
  const activeSessions = store.activeSessions || [];
  const setActiveSessions = store.setActiveSessions;
  const todaySessions = store.todaySessions || [];
  const setTodaySessions = store.setTodaySessions;
  const recentSubTaskIds = store.recentSubTaskIds || [];
  const setRecentSubTaskIds = store.setRecentSubTaskIds;

  useEffect(() => {
    if (!store.tasks || store.tasks.length === 0) {
      fetchAllData().then(data => {
        store.initialize({
          tasks: data.tasks as any,
          activeSessions: data.activeSessions as any,
          todaySessions: data.todaySessions as any,
          pomodoroState: data.pomodoroState,
          recentSubTaskIds: data.recentSubTaskIds
        });
      }).catch(err => console.error("Failed to fetch data:", err));
    }
  }, []); // Run ONCE on mount

  
  
  
  const [currentUsername, setCurrentUsername] = useState(username);
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) return;
    setIsLoggingIn(true);
    try {
      const res = await loginUser(loginUsername);
      if (res.success) {
        localStorage.removeItem("flowstate-storage");
        window.location.reload();
      } else {
        alert("Login failed: " + res.error);
        setIsLoggingIn(false);
      }
    } catch (err) {
      console.error(err);
      alert("Error logging in");
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    localStorage.removeItem("flowstate-storage");
    window.location.reload();
  };

  const [savedView, setSavedView] = useLocalStorage<{ kind: "projects" | "project" | "timer", parentId?: string, subId?: string }>("fs_savedView", { kind: "projects" });

  // Navigation direction for page transitions
  const [navDirection, setNavDirection] = useState<"forward" | "back" | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const view: View = useMemo(() => {
    if (savedView.kind === "project") {
      const parent = tasks.find(t => t.id === savedView.parentId);
      if (parent) return { kind: "project", parent };
    } else if (savedView.kind === "timer") {
      const parent = tasks.find(t => t.id === savedView.parentId);
      if (parent) {
        const sub = (parent.subTasks || []).find(s => s.id === savedView.subId);
        if (sub) return { kind: "timer", parent, sub };
      }
    }
    return { kind: "projects" };
  }, [savedView, tasks]);

  const setView = useCallback((newView: View, direction?: "forward" | "back") => {
    const dir = direction ?? (newView.kind === "projects" ? "back" : "forward");
    setNavDirection(dir);
    setIsTransitioning(true);
    // Small delay to let exit animation play, then switch
    setTimeout(() => {
      if (newView.kind === "projects") {
        setSavedView({ kind: "projects" });
      } else if (newView.kind === "project") {
        setSavedView({ kind: "project", parentId: newView.parent.id });
      } else if (newView.kind === "timer") {
        setSavedView({ kind: "timer", parentId: newView.parent.id, subId: newView.sub.id });
      }
      // Trigger enter animation
      requestAnimationFrame(() => {
        setNavDirection(dir);
        setIsTransitioning(false);
      });
    }, 150);
  }, [setSavedView]);
  const [subTaskHistory, setSubTaskHistory] = useState<Session[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Inputs
  const [newParentName, setNewParentName] = useState("");
  const [newSubTaskName, setNewSubTaskName] = useState("");
  const [showAddProject, setShowAddProject] = useState(false);
  const [showAddSubTask, setShowAddSubTask] = useState(false);

  // Modals
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [pendingSubTaskId, setPendingSubTaskId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "project" | "subtask" | "session"; id: string; name: string } | null>(null);
  const [editSessionOpen, setEditSessionOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editDurationStr, setEditDurationStr] = useState("");

  // Inline rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ id: string; type: "project" | "subtask"; name: string; x: number; y: number } | null>(null);

  // ─── Current Intent State ────────────────────────────────────────────────
  const [intentValue, setIntentValue] = useState("");
  const [intentPromptOpen, setIntentPromptOpen] = useState(false);
  const [isStartingIntent, setIsStartingIntent] = useState(false);
  const [selectedExistingTask, setSelectedExistingTask] = useState<{ parent: FullParentTask; sub: SubTask } | null>(null);
  const [intentFocused, setIntentFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isProcessing, setIsProcessing] = useState(false);

  // Compute matching subtasks for autocomplete
  const intentSuggestions = useMemo(() => {
    const query = intentValue.trim().toLowerCase();
    if (!query || query.length < 1) return [];
    const results: { parent: FullParentTask; sub: SubTask; score: number }[] = [];
    for (const parent of tasks) {
      for (const sub of (parent.subTasks || []) ) {
        const name = sub.name.toLowerCase();
        if (name.includes(query)) {
          // Prioritize: exact match > starts-with > contains
          const score = name === query ? 3 : name.startsWith(query) ? 2 : 1;
          results.push({ parent, sub, score });
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }, [intentValue, tasks]);

  // ─── Checklist State ──────────────
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [checklistSort, setChecklistSort] = useLocalStorage<"newest" | "oldest" | "status" | "status-oldest">("fs_checklist_sort", "newest");

  const currentChecklist = useMemo(() => {
    if (view.kind !== "timer") return [];
    const list = [...(view.sub.checklists || [])];
    
    if (checklistSort === "newest") {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (checklistSort === "oldest") {
      list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (checklistSort === "status") {
      list.sort((a, b) => {
        if (a.done === b.done) {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return a.done ? 1 : -1;
      });
    } else if (checklistSort === "status-oldest") {
      list.sort((a, b) => {
        if (a.done === b.done) {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        return a.done ? 1 : -1;
      });
    }
    return list;
  }, [view, checklistSort]);

  // ─── Recent Tasks ────────────────
  const recentTasks = useMemo(() => {
    const allSubTasks: { parent: FullParentTask; sub: FullSubTask }[] = [];
    tasks.forEach(parent => {
      (parent.subTasks || []).forEach(sub => {
        allSubTasks.push({ parent, sub });
      });
    });

    if (recentSubTaskIds.length > 0) {
      const found: { parent: FullParentTask; sub: FullSubTask }[] = [];
      recentSubTaskIds.forEach(id => {
        const match = allSubTasks.find(t => t.sub.id === id);
        if (match) found.push(match);
      });
      if (found.length < 4) {
        const sortedByNew = allSubTasks.sort((a, b) => new Date(b.sub.created_at).getTime() - new Date(a.sub.created_at).getTime());
        sortedByNew.forEach(t => {
          if (found.length < 4 && !found.some(f => f.sub.id === t.sub.id)) {
            found.push(t);
          }
        });
      }
      return found.slice(0, 4);
    } else {
      return allSubTasks.sort((a, b) => new Date(b.sub.created_at).getTime() - new Date(a.sub.created_at).getTime()).slice(0, 4);
    }
  }, [tasks, recentSubTaskIds]);

  const addChecklistItem = async () => {
    if (!newChecklistItem.trim() || view.kind !== "timer") return;
    const text = newChecklistItem.trim();
    setNewChecklistItem("");
    
    // Optimistic UI update (using a fake ID that will be replaced on refresh)
    const fakeId = `temp-${Date.now()}`;
    setTasks(prev => prev.map(p => 
      p.id === view.parent.id 
        ? { ...p, subTasks: (p.subTasks || []).map(s => s.id === view.sub.id ? { ...s, checklists: [...(s.checklists || []), { id: fakeId, sub_task_id: s.id, text, done: false, created_at: new Date() }] } : s) } 
        : p
    ));

    await createChecklistItem(view.sub.id, text);
    refresh();
  };

  const playPing = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      // Clean bell-like ping
      osc.type = "sine";
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
      
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.warn("Could not play ping sound", e);
    }
  }, []);

  const playFush = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      
      // Generate short burst of white noise
      const bufferSize = ctx.sampleRate * 0.5; // 0.5 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      // Sweep filter down to create the "fush"
      filter.frequency.setValueAtTime(4000, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
      
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start(ctx.currentTime);
    } catch (e) {
      console.warn("Could not play fush sound", e);
    }
  }, []);

  const onToggleChecklistItem = async (itemId: string, currentDone: boolean) => {
    if (view.kind !== "timer") return;
    const isNowDone = !currentDone;
    if (isNowDone) playPing();
    
    // Optimistic UI update
    setTasks(prev => prev.map(p => 
      p.id === view.parent.id 
        ? { ...p, subTasks: (p.subTasks || []).map(s => s.id === view.sub.id ? { ...s, checklists: s.checklists.map(c => c.id === itemId ? { ...c, done: isNowDone } : c) } : s) } 
        : p
    ));

    // Auto-journal logic if marking as done
    if (isNowDone && currentSessionId) {
      const item = view.sub.checklists.find((c: ChecklistItem) => c.id === itemId);
      if (item) {
        const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
        const textToLog = `Completed: ${item.text}`;
        
        // Optimistically update active sessions
        let newNotesStr = "";
        setActiveSessions(prev => prev.map(s => {
          if (s.id === currentSessionId) {
            const currentNotes = s.session_notes ? s.session_notes.trim() : "";
            newNotesStr = currentNotes ? `${currentNotes}\n[${timeStr}] ${textToLog}` : `[${timeStr}] ${textToLog}`;
            return { ...s, session_notes: newNotesStr };
          }
          return s;
        }));
        
        // Fire-and-forget DB update
        if (newNotesStr) updateSessionNotes(currentSessionId, newNotesStr);
      }
    }

    await toggleChecklistItem(itemId, isNowDone);
    refresh();
  };

  const removeChecklistItem = async (itemId: string) => {
    if (view.kind !== "timer") return;

    // Optimistic UI update
    setTasks(prev => prev.map(p => 
      p.id === view.parent.id 
        ? { ...p, subTasks: (p.subTasks || []).map(s => s.id === view.sub.id ? { ...s, checklists: s.checklists.filter(c => c.id !== itemId) } : s) } 
        : p
    ));

    await deleteChecklistItem(itemId);
    refresh();
  };

  // ─── Session Journal State ────────
  type JournalEntry = { id: string; text: string; time: string };
  const [newJournalEntry, setNewJournalEntry] = useState("");

  const currentSessionId = useMemo(() => {
    if (view.kind !== "timer") return null;
    const session = activeSessions.find(s => s.sub_task_id === view.sub.id);
    return session?.id || null;
  }, [view, activeSessions]);

  const currentJournal = useMemo(() => {
    if (!currentSessionId) return [];
    const session = activeSessions.find(s => s.id === currentSessionId);
    if (!session || !session.session_notes) return [];
    
    // Parse from session_notes string
    return session.session_notes.split('\n').filter(Boolean).map((line, i) => {
      const match = line.match(/^\[(.*?)\] (.*)$/);
      if (match) return { id: `${currentSessionId}-j-${i}`, time: match[1], text: match[2] };
      return { id: `${currentSessionId}-j-${i}`, time: "", text: line };
    });
  }, [currentSessionId, activeSessions]);

  const addJournalEntry = async () => {
    if (!newJournalEntry.trim() || !currentSessionId) return;
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      text: newJournalEntry.trim(),
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
    };
    
    const updatedJournal = [...currentJournal, entry];
    setNewJournalEntry("");
    playFush();
    
    const notesString = updatedJournal.map(e => `[${e.time}] ${e.text}`).join('\n');
    store.pushSyncOperation("updateSessionNotes", { id: currentSessionId, notes: notesString });
    refresh();
  };

  // ─── Pomodoro State ──────────────────────────────────────────────────────
  const [pomodoroModeState, setPomodoroModeLocal] = useState(initialPomodoroState?.pomodoroMode ?? false);
  const [showSnail, setShowSnail] = useLocalStorage("fs_showSnail", true);
  const [useProTimePicker, setUseProTimePicker] = useLocalStorage("fs_pro_time_picker", false);
  const [activeProTab, setActiveProTab] = useState<TimerMode>("work");
  const [workDurationState, setWorkDurationLocal] = useState(initialPomodoroState?.workDuration ?? 25);
  const [shortBreakDurationState, setShortBreakDurationLocal] = useState(initialPomodoroState?.shortBreakDuration ?? 5);
  const [longBreakDurationState, setLongBreakDurationLocal] = useState(initialPomodoroState?.longBreakDuration ?? 15);
  const [sessionsBeforeLongBreakState, setSessionsBeforeLongBreakLocal] = useState(initialPomodoroState?.sessionsBeforeLongBreak ?? 4);

  const [pomodoroPhaseState, setPomodoroPhaseLocal] = useState<"work" | "short_break" | "long_break">((initialPomodoroState?.pomodoroPhase as any) ?? "work");
  const [pomodorosCompletedState, setPomodorosCompletedLocal] = useState(initialPomodoroState?.pomodorosCompleted ?? 0);
  const [breakStartTimeState, setBreakStartTimeLocal] = useState<string | null>(initialPomodoroState?.breakStartTime ? new Date(initialPomodoroState.breakStartTime).toISOString() : null);
  const [pomodoroAccumulatedState, setPomodoroAccumulatedLocal] = useState(initialPomodoroState?.pomodoroAccumulated ?? 0);

  const pomodoroMode = pomodoroModeState;
  const workDuration = workDurationState;
  const shortBreakDuration = shortBreakDurationState;
  const longBreakDuration = longBreakDurationState;
  const sessionsBeforeLongBreak = sessionsBeforeLongBreakState;
  const pomodoroPhase = pomodoroPhaseState;
  const pomodorosCompleted = pomodorosCompletedState;
  const breakStartTime = breakStartTimeState;
  const pomodoroAccumulated = pomodoroAccumulatedState;
  const setPomodoroMode = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    setPomodoroModeLocal((prev: boolean) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ pomodoroMode: next }) }), 0); return next; });
  }, []);
  const setWorkDuration = useCallback((val: number | ((prev: number) => number)) => {
    setWorkDurationLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ workDuration: next }) }), 0); return next; });
  }, []);
  const setShortBreakDuration = useCallback((val: number | ((prev: number) => number)) => {
    setShortBreakDurationLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ shortBreakDuration: next }) }), 0); return next; });
  }, []);
  const setLongBreakDuration = useCallback((val: number | ((prev: number) => number)) => {
    setLongBreakDurationLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ longBreakDuration: next }) }), 0); return next; });
  }, []);
  const setSessionsBeforeLongBreak = useCallback((val: number | ((prev: number) => number)) => {
    setSessionsBeforeLongBreakLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ sessionsBeforeLongBreak: next }) }), 0); return next; });
  }, []);
  const setPomodoroPhase = useCallback((val: any) => {
    setPomodoroPhaseLocal((prev: any) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ pomodoroPhase: next }) }), 0); return next; });
  }, []);
  const setPomodorosCompleted = useCallback((val: number | ((prev: number) => number)) => {
    setPomodorosCompletedLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ pomodorosCompleted: next }) }), 0); return next; });
  }, []);
  const setBreakStartTime = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    setBreakStartTimeLocal((prev: string | null) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ breakStartTime: next ? new Date(next) : null }) }), 0); return next; });
  }, []);
  const setPomodoroAccumulated = useCallback((val: number | ((prev: number) => number)) => {
    setPomodoroAccumulatedLocal((prev: number) => { const next = typeof val === 'function' ? val(prev) : val; setTimeout(() => startTransition(() => { updateUserPomodoroState({ pomodoroAccumulated: next }) }), 0); return next; });
  }, []);
  const [isPaused, setIsPaused] = useLocalStorage("fs_isPaused", false);

  // ─── Theme ────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("fs_theme", "dark");
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // ─── Audio & Notifications ───────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
    }
  }, []);

  const playNotification = useCallback(() => {
    try {
      const ctx = getAudioContext();
      if (ctx) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1);
        osc.stop(ctx.currentTime + 1);
      }
      
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("FlowState Timer", { body: "Your interval is complete!" });
      }
    } catch (e) {
      console.warn("Could not play notification sound", e);
    }
  }, []);

  // ─── Effects ─────────────────────────────────────────────────────────────
  
  
  

  // Today's stats computation
  const todayTotalSeconds = useMemo(() => todaySessions.reduce((sum, s) => sum + s.duration, 0), [todaySessions]);
  const todaySessionCount = todaySessions.length;

  useEffect(() => {
    if (view.kind === "timer") {
      getSubTaskSessions(view.sub.id).then(setSubTaskHistory);
    } else {
      setSubTaskHistory([]);
    }
  }, [view, activeSessions]);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);



  // ─── Actions ─────────────────────────────────────────────────────────────
  const refresh = useCallback(() => { /* local first: do nothing */ }, []);

  const doAddProject = async () => {
    const name = newParentName.trim();
    if (!name) return;
    await createParentTask(name);
    setNewParentName("");
    setShowAddProject(false);
    refresh();
  };

  const doAddSubTask = async (parentId: string) => {
    const name = newSubTaskName.trim();
    if (!name) return;
    await createSubTask(parentId, name);
    setNewSubTaskName("");
    setShowAddSubTask(false);
    refresh();
  };

  const doRename = async (id: string, type: "project" | "subtask") => {
    const val = renameValue.trim();
    if (!val) { setRenamingId(null); return; }
    if (type === "project") await renameParentTask(id, val);
    else await renameSubTask(id, val);
    setRenamingId(null);
    refresh();
  };

  const doDelete = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "project") {
      await deleteParentTask(deleteConfirm.id);
      if (view.kind !== "projects") setView({ kind: "projects" });
    } else if (deleteConfirm.type === "subtask") {
      await deleteSubTask(deleteConfirm.id);
      if (view.kind === "timer") {
        const parent = tasks.find((t) => (t.subTasks || []).some((s) => s.id === deleteConfirm.id));
        if (parent) setView({ kind: "project", parent });
        else setView({ kind: "projects" });
      }
    } else if (deleteConfirm.type === "session") {
      await deleteSession(deleteConfirm.id);
    }
    setDeleteConfirm(null);
    refresh();
  };

  const handleStartTimer = async (subTaskId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    if (activeSessions.length > 0) {
      setPendingSubTaskId(subTaskId);
      setConflictModalOpen(true);
      setIsProcessing(false);
    } else {
      if (pomodoroMode && pomodoroPhase !== "work") {
        setBreakStartTime(new Date().toISOString());
        setIsProcessing(false);
      } else {
        const fakeSession = {
          id: "temp-" + Date.now(),
          sub_task_id: subTaskId,
          start_time: new Date(),
          end_time: null,
          duration: 0,
          session_notes: null,
          is_paused: false,
          last_paused_at: null,
          accumulated_paused_time: 0
        };
        setActiveSessions(prev => [...prev, fakeSession as any]);
        setIsPaused(false);
        setIsProcessing(false);
        
        store.pushSyncOperation("startSession", { subTaskId: subTaskId });
        refresh();
      }
    }
  };

  const handleStartIntent = async (mode: "pomodoro" | "normal") => {
    if (isStartingIntent) return;
    setIsStartingIntent(true);
    
    try {
      // If user selected an existing task, navigate to it directly
      if (selectedExistingTask) {
        setPomodoroMode(mode === "pomodoro");
        setIntentPromptOpen(false);
        setIntentValue("");
        setSelectedExistingTask(null);
        setView({ kind: "timer", parent: selectedExistingTask.parent, sub: selectedExistingTask.sub });
        await handleStartTimer(selectedExistingTask.sub.id);
        return;
      }

      if (!intentValue.trim()) return;

      // 1. Find or create "Inbox"
      let inbox = tasks.find(t => t.name.toLowerCase() === "inbox");
      if (!inbox) {
        
    const inboxId = uuidv4();
    const newInbox = { id: inboxId, name: "Inbox", subTasks: [], user_id: null, general_notes: null, total_cumulative_time: 0, created_at: new Date() } as FullParentTask;
    store.pushSyncOperation("createParentTask", { name: "Inbox", id: inboxId });

        inbox = newInbox;
        // Optimistic update to prevent being kicked out by the sync useEffect
        setTasks(prev => [...prev, newInbox]);
      }
      
      // 2. Create subtask
      const subtaskId = uuidv4(); const subtask = { id: subtaskId, parent_task_id: inbox.id, name: intentValue.trim(), checklists: [], total_cumulative_time: 0, created_at: new Date() } as FullSubTask; store.pushSyncOperation("createSubTask", { parentId: inbox.id, name: intentValue.trim(), id: subtaskId });
      
      // Optimistic update
      setTasks(prev => prev.map(p => {
        if (p.id === inbox.id) {
          return { ...p, subTasks: [...p.subTasks, { ...subtask, checklists: [] }] };
        }
        return p;
      }));
      
      // 3. Set mode
      setPomodoroMode(mode === "pomodoro");
      
      // 4. Update UI
      setIntentPromptOpen(false);
      setIntentValue("");
      setView({ kind: "timer", parent: inbox, sub: subtask });
      
      // 5. Start timer using the robust conflict-handling function
      await handleStartTimer(subtask.id);
      
    } catch (e) {
      toast.error("Failed to start quick task.");
    } finally {
      setIsStartingIntent(false);
    }
  };

  const handleStartWithPause = async () => {
    setActiveSessions([]);
    for (const s of activeSessions) store.pushSyncOperation("stopSession", s.id);
    if (pendingSubTaskId) store.pushSyncOperation("startSession", { subTaskId: pendingSubTaskId });
    setConflictModalOpen(false);
    refresh();
  };

  const handleStartConcurrent = async () => {
    if (pendingSubTaskId) {
      const fakeSession = {
        id: "temp-" + Date.now(),
        sub_task_id: pendingSubTaskId,
        start_time: new Date(),
        end_time: null,
        duration: 0,
        session_notes: null,
        is_paused: false,
        last_paused_at: null,
        accumulated_paused_time: 0
      };
      setActiveSessions(prev => [...prev, fakeSession as any]);
      store.pushSyncOperation("startSession", { subTaskId: pendingSubTaskId });
    }
    setConflictModalOpen(false);
    refresh();
  };

  const handleStopTimer = async (sessionId: string, autoPomodoroTransition = false) => {
    setIsProcessing(true);
    setIsPaused(false);
    
    const sessionToStop = activeSessions.find(s => s.id === sessionId);
    if (sessionToStop) {
      const end_time = new Date();
      const elapsedTotal = Math.round((end_time.getTime() - new Date(sessionToStop.start_time).getTime()) / 1000);
      let duration = Math.max(0, elapsedTotal - (sessionToStop.accumulated_paused_time || 0));
      
      if (sessionToStop.is_paused && sessionToStop.last_paused_at) {
        const finalPauseTime = Math.round((end_time.getTime() - new Date(sessionToStop.last_paused_at).getTime()) / 1000);
        duration = Math.max(0, duration - finalPauseTime);
      }
      
      const stoppedSession = {
        ...sessionToStop,
        end_time,
        duration,
        is_paused: false,
        last_paused_at: null
      };

      setActiveSessions(prev => prev.filter(s => s.id !== sessionId));
      setTodaySessions(prev => [stoppedSession as any, ...prev]);

      setTasks(prevTasks => prevTasks.map(pt => {
        let updatedPt = false;
        const newSubTasks = pt.subTasks?.map(st => {
          if (st.id === sessionToStop.sub_task_id) {
            updatedPt = true;
            return { ...st, total_cumulative_time: (st.total_cumulative_time || 0) + duration };
          }
          return st;
        });
        if (updatedPt) {
          return { ...pt, total_cumulative_time: (pt.total_cumulative_time || 0) + duration, subTasks: newSubTasks };
        }
        return pt;
      }));
    }
    
    store.pushSyncOperation("stopSession", sessionId);
    
    if (pomodoroMode) {
      if (!autoPomodoroTransition) {
        setPomodoroPhase("work");
        setBreakStartTime(null);
        setPomodoroAccumulated(0);
      }
    }
    setIsProcessing(false);
    refresh();
  };

  const handlePauseTimer = async (sessionId: string) => {
    setIsPaused(true);
    setActiveSessions(prev => prev.map(s => s.id === sessionId ? { ...s, is_paused: true, last_paused_at: new Date() } : s));
    store.pushSyncOperation("pauseSession", sessionId);
    refresh();
  };

  const handleResumeTimer = async (sessionId: string) => {
    setIsPaused(false);
    setActiveSessions(prev => prev.map(s => {
      if (s.id === sessionId && s.is_paused && s.last_paused_at) {
        const pausedDuration = Math.round((new Date().getTime() - new Date(s.last_paused_at).getTime()) / 1000);
        return { 
          ...s, 
          is_paused: false, 
          last_paused_at: null,
          accumulated_paused_time: (s.accumulated_paused_time || 0) + pausedDuration
        };
      }
      return s;
    }));
    store.pushSyncOperation("resumeSession", sessionId);
    refresh();
  };

  const skipBreak = () => {
    setPomodoroPhase("work");
    setBreakStartTime(null);
    toast("Break skipped. Ready to focus!");
  };

  const handleEditSession = (session: Session) => {
    setEditingSession(session);
    setEditStartTime(new Date(session.start_time).toISOString().slice(0, 16));
    setEditEndTime(session.end_time ? new Date(session.end_time).toISOString().slice(0, 16) : "");
    setEditDurationStr(session.duration.toString());
    setEditSessionOpen(true);
  };

  const submitEditSession = async () => {
    if (!editingSession || !editStartTime || !editDurationStr) return;
    const end = editEndTime ? new Date(editEndTime) : null;
    try {
      await updateSessionTime(editingSession.id, new Date(editStartTime), end, parseInt(editDurationStr, 10));
      toast.success("Session updated");
      setEditSessionOpen(false);
      refresh();
    } catch { toast.error("Failed to update session"); }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────
  const getElapsed = useCallback((startTime: string | Date) => 
    Math.max(0, Math.floor((currentTime.getTime() - new Date(startTime).getTime()) / 1000)),
  [currentTime]);

  const getLive = useCallback((session: Session | FullSession) => {
    if (session.is_paused && session.last_paused_at) {
      return Math.max(0, Math.floor((new Date(session.last_paused_at).getTime() - new Date(session.start_time).getTime()) / 1000) - session.accumulated_paused_time);
    }
    return Math.max(0, Math.floor((currentTime.getTime() - new Date(session.start_time).getTime()) / 1000) - session.accumulated_paused_time);
  }, [currentTime]);

  const activeForSub = (subId: string) => activeSessions.find((s) => s.sub_task_id === subId) ?? null;

  const openContext = (e: React.MouseEvent, id: string, type: "project" | "subtask", name: string) => {
    e.preventDefault();
    e.stopPropagation();

    const menuWidth = 160;
    const menuHeight = 90;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 16);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 16);

    setContextMenu({ id, type, name, x, y });
  };

  // ─── Timer Interval ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    let worker: Worker | null = null;
    
    try {
      worker = new Worker("/timer-worker.js");
      
      worker.onmessage = (e) => {
        if (e.data === 'tick') {
          const now = new Date();
          setCurrentTime(now);

          if (pomodoroMode) {
            if (pomodoroPhase === "work") {
              if (activeSessions.length > 0) {
                // Check all active sessions. If any session hits the target, stop ALL.
                let shouldStopAll = false;
                for (const session of activeSessions) {
                  // Replicate getLive manually since we are outside React render cycle
                  let elapsed = 0;
                  if (session.is_paused && session.last_paused_at) {
                    elapsed = Math.max(0, Math.floor((new Date(session.last_paused_at).getTime() - new Date(session.start_time).getTime()) / 1000) - session.accumulated_paused_time);
                  } else {
                    elapsed = Math.max(0, Math.floor((now.getTime() - new Date(session.start_time).getTime()) / 1000) - session.accumulated_paused_time);
                  }
                  
                  if (elapsed + pomodoroAccumulated >= workDuration * 60) {
                    shouldStopAll = true;
                    break;
                  }
                }
                
                if (shouldStopAll) {
                  playNotification();
                  
                  const newCompleted = pomodorosCompleted + 1;
                  setPomodorosCompleted(newCompleted);
                  const isLongBreak = newCompleted % sessionsBeforeLongBreak === 0;
                  setPomodoroPhase(isLongBreak ? "long_break" : "short_break");
                  setBreakStartTime(new Date().toISOString());
                  setPomodoroAccumulated(0);
                  toast.success("Focus session complete! Time for a break.");
                  
                  activeSessions.forEach(s => handleStopTimer(s.id, true));
                }
              }
            } else {
              // Break phase
              if (breakStartTime) {
                const elapsed = Math.floor((now.getTime() - new Date(breakStartTime).getTime()) / 1000);
                const target = (pomodoroPhase === "long_break" ? longBreakDuration : shortBreakDuration) * 60;
                if (elapsed >= target) {
                  playNotification();
                  setPomodoroPhase("work");
                  setBreakStartTime(null);
                  toast("Break over! Ready to focus?");
                }
              }
            }
          }
        }
      };

      worker.postMessage('start');
    } catch (e) {
      console.warn("Worker not supported or failed to load, falling back to setInterval", e);
      // Fallback
      const interval = setInterval(() => {
        const now = new Date();
        setCurrentTime(now);
        // Fallback logic omitted for brevity, worker should always work in modern browsers
      }, 1000);
      return () => clearInterval(interval);
    }

    return () => {
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
    };
  }, [pomodoroMode, pomodoroPhase, activeSessions, workDuration, shortBreakDuration, longBreakDuration, breakStartTime, playNotification]);


  const workGradientConfig = useMemo(() => ({
    preset: "custom" as const,
    color1: theme === "light" ? "#F8FAFC" : "#030014", 
    color2: theme === "light" ? "#F1F5F9" : "#150530", 
    color3: theme === "light" ? "#E9D5FF" : "#401060", 
    speed: 0.8,
    distortion: 20,
    scale: 0.8,
  }), [theme]);

  const breakGradientConfig = useMemo(() => ({
    preset: "custom" as const,
    color1: theme === "light" ? "#F8FAFC" : "#000514", 
    color2: theme === "light" ? "#F0F9FF" : "#051530", 
    color3: theme === "light" ? "#BAE6FD" : "#103060", 
    speed: 0.8,
    distortion: 20,
    scale: 0.8,
  }), [theme]);

  return (
    <div className="relative min-h-[100dvh] w-full bg-transparent text-foreground isolate">
      <AnimatedGradient 
        config={workGradientConfig}
        className={`fixed inset-0 z-[-1] transition-opacity duration-[5000ms] ease-in-out pointer-events-none ${pomodoroPhase === "work" ? (theme === "light" ? "opacity-100" : "opacity-30") : "opacity-0"}`}
      />
      <AnimatedGradient 
        config={breakGradientConfig}
        className={`fixed inset-0 z-[-1] transition-opacity duration-[5000ms] ease-in-out pointer-events-none ${pomodoroPhase !== "work" ? (theme === "light" ? "opacity-100" : "opacity-30") : "opacity-0"}`}
      />

      {/* ═══════ Top Bar ═══════ */}
      <header className="sticky top-0 z-40 glass-surface">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-8 h-14 gap-2">
          <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
            {view.kind !== "projects" && (
              <button
                onClick={() => {
                  if (view.kind === "timer") setView({ kind: "project", parent: view.parent });
                  else setView({ kind: "projects" });
                }}
                className="p-1.5 -ml-1.5 rounded-lg md:hover:bg-surface-overlay-hover transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}



            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm flex-1 min-w-0">
              <button
                onClick={() => setView({ kind: "projects" })}
                className={`font-semibold tracking-tight transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap ${view.kind === "projects" ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
              >
                <Timer className="w-4 h-4 text-primary shrink-0" />
                <span className="hidden sm:inline">FlowState</span>
              </button>
              {view.kind !== "projects" && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                  <button
                    onClick={() => setView({ kind: "project", parent: view.parent })}
                    className={`truncate transition-colors ${view.kind === "project" ? "text-foreground font-medium" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
                  >
                    {view.parent.name}
                  </button>
                </>
              )}
              {view.kind === "timer" && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/70 shrink-0" />
                  <span className="text-foreground font-medium truncate">
                    {view.sub.name}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Active timer pill */}
            {activeSessions.length > 0 && view.kind !== "timer" && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary shrink-0 whitespace-nowrap">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                {activeSessions.length} active
              </div>
            )}

            
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg md:hover:bg-surface-overlay-hover transition-colors ml-1"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          {currentUsername && currentUsername !== "User" ? (
            <button onClick={handleLogout} className="flex items-center gap-2 px-3 h-9 rounded-full border border-surface-border bg-surface-overlay hover:bg-surface-overlay-hover transition-colors group relative ml-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                {currentUsername.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-foreground group-hover:hidden truncate max-w-[80px]">Hi, {currentUsername}</span>
              <span className="text-sm font-medium text-red-400 hidden group-hover:inline max-w-[80px]">Logout</span>
            </button>
          ) : (
            <button onClick={() => setLoginModalOpen(true)} className="flex items-center gap-2 px-3 h-9 rounded-full border border-surface-border bg-surface-overlay hover:bg-surface-overlay-hover transition-colors ml-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                ?
              </span>
              <span className="text-sm font-medium text-foreground">Login to Sync</span>
            </button>
          )}

          </div>
        </div>
      </header>

      {/* ═══════ Content ═══════ */}
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-40 md:pb-12">

        {/* ─── Projects View ─── */}
        {view.kind === "projects" && (
          <div className={cn("pt-8 transition duration-300 ease-out", isTransitioning ? "opacity-0 translate-x-[-20px]" : "opacity-100 translate-x-0")}>
            
            {/* ─── Current Intent Field ─── */}
            <div className="mb-14 relative max-w-2xl mx-auto group">
              <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-0 group-focus-within:opacity-40 transition-opacity duration-1000 pointer-events-none" />
              <div className="relative z-10 flex items-center bg-[var(--intent-bg)] backdrop-blur-2xl border border-surface-border md:hover:border-surface-border focus-within:border-primary/30 rounded-full shadow-2xl transition-all duration-500 h-16 sm:h-20 px-3 overflow-hidden">
                <input
                  type="text"
                  placeholder="What is your focus right now?"
                  value={intentValue}
                  onChange={(e) => {
                    setIntentValue(e.target.value);
                    setSelectedExistingTask(null);
                    setHighlightedIndex(-1);
                  }}
                  onFocus={() => setIntentFocused(true)}
                  onBlur={() => {
                    setIntentFocused(false);
                  }}
                  onKeyDown={(e) => {
                    const showSuggestions = intentFocused && intentSuggestions.length > 0 && !selectedExistingTask;
                    if (showSuggestions) {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedIndex(prev => Math.min(prev + 1, intentSuggestions.length - 1));
                        return;
                      }
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedIndex(prev => Math.max(prev - 1, -1));
                        return;
                      }
                      if (e.key === "Enter" && highlightedIndex >= 0) {
                        e.preventDefault();
                        const match = intentSuggestions[highlightedIndex];
                        setIntentValue(match.sub.name);
                        setSelectedExistingTask({ parent: match.parent, sub: match.sub });
                        setHighlightedIndex(-1);
                        setIntentPromptOpen(true);
                        return;
                      }
                    }
                    if (e.key === "Enter" && (intentValue.trim() || selectedExistingTask)) {
                      setIntentPromptOpen(true);
                    }
                    if (e.key === "Escape") {
                      setHighlightedIndex(-1);
                      setSelectedExistingTask(null);
                    }
                  }}
                  className="flex-1 min-w-0 h-full text-lg sm:text-2xl bg-transparent border-none outline-none focus-visible:ring-1 focus-visible:ring-primary/50 placeholder:text-muted-foreground/70 text-surface-text font-medium tracking-tight px-4 sm:px-6 text-ellipsis overflow-hidden whitespace-nowrap"
                />
                <button 
                  type="button"
                  onClick={() => {
                    if (intentValue.trim() || selectedExistingTask) {
                      setIntentPromptOpen(true);
                    }
                  }}
                  disabled={(!intentValue.trim() && !selectedExistingTask) || isStartingIntent}
                  className={cn(
                    "flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0 transition-all duration-500 disabled:opacity-50 disabled:cursor-not-allowed",
                    (intentValue.trim() || selectedExistingTask)
                      ? "bg-primary text-primary-foreground hover:scale-105 hover:bg-primary/90 shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:shadow-[0_0_30px_rgba(124,58,237,0.5)] cursor-pointer" 
                      : "bg-surface-overlay text-surface-text/20 shadow-none"
                  )}
                >
                  {isStartingIntent ? <span className="animate-spin text-xl">⏳</span> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
                </button>
              </div>

              {/* ─── Autocomplete Suggestions Dropdown ─── */}
              {intentFocused && intentSuggestions.length > 0 && !selectedExistingTask && (
                <div className="absolute z-30 left-0 right-0 top-full mt-2 mx-4 sm:mx-6 rounded-2xl bg-[var(--dropdown-bg)] backdrop-blur-xl border border-surface-border shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-surface-border">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground/70 font-semibold">Existing Tasks</p>
                  </div>
                  {intentSuggestions.map((match, i) => (
                    <button
                      key={match.sub.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIntentValue(match.sub.name);
                        setSelectedExistingTask({ parent: match.parent, sub: match.sub });
                        setHighlightedIndex(-1);
                        setIntentPromptOpen(true);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                        i === highlightedIndex ? "bg-primary/10" : "md:hover:bg-surface-overlay"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-surface-overlay border border-surface-border flex items-center justify-center shrink-0">
                        <Timer className="w-3.5 h-3.5 text-primary/60" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{match.sub.name}</p>
                        <p className="text-sm text-muted-foreground/70 truncate">{match.parent.name} · {formatShort(match.sub.total_cumulative_time)}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ─── Today's Focus Stats ─── */}
            <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:justify-center sm:gap-10 mb-10">
              <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-lg font-bold tracking-tight text-foreground font-mono leading-none sm:leading-normal">{formatShort(todayTotalSeconds)}</p>
                  <p className="text-[9px] sm:text-xs uppercase tracking-widest text-muted-foreground/70 font-medium mt-1 sm:mt-0">Today</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-8 bg-surface-border" />
              <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                  <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-lg font-bold tracking-tight text-foreground font-mono leading-none sm:leading-normal">{todaySessionCount}</p>
                  <p className="text-[9px] sm:text-xs uppercase tracking-widest text-muted-foreground/70 font-medium mt-1 sm:mt-0">Sessions</p>
                </div>
              </div>
              <div className="hidden sm:block w-px h-8 bg-white/[0.06]" />
              <div className="flex flex-col sm:flex-row items-center gap-1.5 sm:gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-base sm:text-lg font-bold tracking-tight text-foreground font-mono leading-none sm:leading-normal">{tasks.length}</p>
                  <p className="text-[9px] sm:text-xs uppercase tracking-widest text-muted-foreground/70 font-medium mt-1 sm:mt-0">Projects</p>
                </div>
              </div>
            </div>

            {/* ─── Recent Tasks ─── */}
            {recentTasks.length > 0 && (
              <div className="mb-10">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight mb-4">Recent Tasks</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {recentTasks.map(({ parent, sub }) => {
                    const hasActive = activeSessions.some(s => s.sub_task_id === sub.id);
                    return (
                      <button
                        key={sub.id}
                        onClick={() => setView({ kind: "timer", parent, sub })}
                        className="group relative flex flex-col items-start p-4 rounded-xl border border-surface-border bg-surface-overlay text-left transition-all duration-200 md:hover:bg-surface-overlay-hover md:hover:border-primary/30"
                      >
                        <div className="flex items-center gap-2 mb-2 w-full">
                          <div className="w-6 h-6 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <Timer className="w-3 h-3 text-primary" />
                          </div>
                          <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground/70 truncate flex-1">{parent.name}</span>
                          {hasActive && <div className="w-1.5 h-1.5 rounded-full bg-primary pulse-ring shrink-0" />}
                        </div>
                        <h3 className="font-semibold text-[15px] text-foreground truncate w-full mb-1.5">{sub.name}</h3>
                        <p className="text-xs text-muted-foreground/50 font-mono">{formatShort(sub.total_cumulative_time)}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Projects</h2>
              <Button
                onClick={() => { setShowAddProject(true); setNewParentName(""); }}
                className="h-9 px-4 text-sm rounded-xl gap-2"
              >
                <Plus className="w-4 h-4" /> New Project
              </Button>
            </div>

            {/* Add project inline */}
            {showAddProject && (
              <div className="mb-4 flex gap-2 items-center rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                <Input
                  autoFocus
                  placeholder="Project name..."
                  value={newParentName}
                  onChange={(e) => setNewParentName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doAddProject(); if (e.key === "Escape") setShowAddProject(false); }}
                  className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-primary/50 text-sm h-8 placeholder:text-muted-foreground/70"
                />
                <Button size="sm" onClick={doAddProject} className="h-8 rounded-lg px-4 text-xs shrink-0">Create</Button>
                <button onClick={() => setShowAddProject(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded md:hover:bg-surface-overlay-hover"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {tasks.length === 0 && !showAddProject ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-surface-overlay border border-surface-border flex items-center justify-center mb-6">
                  <FolderOpen className="w-8 h-8 text-muted-foreground/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground/70">No projects yet</h3>
                <p className="text-sm text-muted-foreground/70 max-w-[280px]">Create your first project to start tracking time</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((parent) => {
                  const hasActive = activeSessions.some((s) => (parent.subTasks || []).some((sub) => sub.id === s.sub_task_id));
                  return (
                    <div
                      key={parent.id}
                      onClick={() => setView({ kind: "project", parent })}
                      onContextMenu={(e) => openContext(e, parent.id, "project", parent.name)}
                      className="group relative rounded-2xl border border-surface-border bg-surface-overlay md:hover:bg-surface-overlay md:hover:border-surface-border p-5 cursor-pointer transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                          {hasActive && <div className="w-2 h-2 rounded-full bg-primary pulse-ring shrink-0 mt-0.5" />}
                          {renamingId === parent.id ? (
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") doRename(parent.id, "project"); if (e.key === "Escape") setRenamingId(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 text-sm bg-transparent border-surface-border w-full"
                            />
                          ) : (
                            <h3 className="font-semibold text-[15px] tracking-tight truncate">{parent.name}</h3>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openContext(e, parent.id, "project", parent.name); }}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 md:hover:bg-surface-overlay-hover transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/80" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground/80">
                        <span>{(parent.subTasks || []).length} {(parent.subTasks || []).length === 1 ? "task" : "tasks"}</span>
                        <span className="font-mono">{formatShort(parent.total_cumulative_time)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Project Detail View ─── */}
        {view.kind === "project" && (
          <div className={cn("pt-8 transition duration-300 ease-out", isTransitioning ? (navDirection === "forward" ? "opacity-0 translate-x-[20px]" : "opacity-0 translate-x-[-20px]") : "opacity-100 translate-x-0")}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{view.parent.name}</h2>
              <Button
                onClick={() => { setShowAddSubTask(true); setNewSubTaskName(""); }}
                className="h-9 px-4 text-sm rounded-xl gap-2"
              >
                <Plus className="w-4 h-4" /> New Task
              </Button>
            </div>
            <p className="text-sm text-muted-foreground/80 mb-6 font-mono">
              {formatShort(view.parent.total_cumulative_time)} tracked across {(view.parent.subTasks || []).length} tasks
            </p>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-2 block px-1">
                Project Notes
              </label>
              <Textarea
                className="min-h-[100px] resize-none bg-surface-overlay border-surface-border text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-primary/20 rounded-xl"
                placeholder="Notes for this project..."
                defaultValue={view.parent.general_notes || ""}
                key={`pn-${view.parent.id}`}
                onBlur={(e) => updateParentTaskNotes(view.parent.id, e.target.value)}
              />
            </div>

            {/* Add sub-task inline */}
            {showAddSubTask && (
              <div className="mb-3 flex gap-2 items-center rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
                <Input
                  autoFocus
                  placeholder="Task name..."
                  value={newSubTaskName}
                  onChange={(e) => setNewSubTaskName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") doAddSubTask(view.parent.id); if (e.key === "Escape") setShowAddSubTask(false); }}
                  className="bg-transparent border-none focus-visible:ring-1 focus-visible:ring-primary/50 text-sm h-8 placeholder:text-muted-foreground/70"
                />
                <Button size="sm" onClick={() => doAddSubTask(view.parent.id)} className="h-8 rounded-lg px-4 text-xs shrink-0">Create</Button>
                <button onClick={() => setShowAddSubTask(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded md:hover:bg-surface-overlay-hover"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {(view.parent.subTasks || []).length === 0 && !showAddSubTask ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-surface-overlay border border-surface-border flex items-center justify-center mb-5">
                  <FileText className="w-6 h-6 text-muted-foreground/70" />
                </div>
                <h3 className="text-base font-semibold mb-1 text-foreground/70">No tasks yet</h3>
                <p className="text-sm text-muted-foreground/70">Add a task to start tracking</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {(view.parent.subTasks || []).map((sub) => {
                  const active = activeForSub(sub.id);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => setView({ kind: "timer", parent: view.parent, sub })}
                      onContextMenu={(e) => openContext(e, sub.id, "subtask", sub.name)}
                      className="group flex items-center gap-4 rounded-xl border border-surface-border bg-surface-overlay md:hover:bg-surface-overlay md:hover:border-surface-border px-5 py-4 cursor-pointer transition-all duration-200"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {active && <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />}
                          {renamingId === sub.id ? (
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") doRename(sub.id, "subtask"); if (e.key === "Escape") setRenamingId(null); }}
                              onClick={(e) => e.stopPropagation()}
                              className="h-7 text-sm bg-transparent border-surface-border w-full max-w-xs"
                            />
                          ) : (
                            <span className="font-medium text-sm truncate">{sub.name}</span>
                          )}
                        </div>
                        {active && (
                          <p className="text-xs text-primary/70 font-mono mt-1">
                            {formatDuration(getLive(active))} running
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground/70">{formatShort(sub.total_cumulative_time)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openContext(e, sub.id, "subtask", sub.name); }}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 md:hover:bg-surface-overlay-hover transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/80" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/70" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Timer View ─── */}
        {view.kind === "timer" && (() => {
          const activeSession = activeForSub(view.sub.id);
          const isWorkRunning = !!activeSession;
          const isBreakRunning = pomodoroMode && pomodoroPhase !== "work" && breakStartTime !== null;
          const isRunning = isWorkRunning || isBreakRunning;

          let displayTime = "00:00";
          if (pomodoroMode) {
            if (pomodoroPhase === "work") {
              if (activeSession) {
                const elapsed = getLive(activeSession);
                const remaining = Math.max(0, workDuration * 60 - pomodoroAccumulated - elapsed);
                displayTime = formatDuration(remaining);
              } else if (isPaused) {
                const remaining = Math.max(0, workDuration * 60 - pomodoroAccumulated);
                displayTime = formatDuration(remaining);
              } else {
                displayTime = formatDuration(workDuration * 60);
              }
            } else {
              const target = (pomodoroPhase === "long_break" ? longBreakDuration : shortBreakDuration) * 60;
              if (breakStartTime) {
                const elapsed = getElapsed(breakStartTime);
                const remaining = Math.max(0, target - elapsed);
                displayTime = formatDuration(remaining);
              } else {
                displayTime = formatDuration(target);
              }
            }
          } else {
            displayTime = activeSession ? formatDuration(getLive(activeSession)) : formatDuration(0);
          }

          return (
            <div className={cn("pt-6 md:pt-10 transition duration-300 ease-out", isTransitioning ? "opacity-0 translate-x-[20px]" : "opacity-100 translate-x-0")}>
              {/* Pomodoro Indicator */}
              {pomodoroMode && (
                <div className="flex items-center justify-center mb-6">
                  <div className={`px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider uppercase border 
                    ${pomodoroPhase === "work" ? "bg-primary/10 border-primary/20 text-primary" : 
                      "bg-blue-500/10 border-blue-500/20 text-blue-400"}`}>
                    {pomodoroPhase === "work" ? "Focus Session" : pomodoroPhase === "short_break" ? "Short Break" : "Long Break"}
                    <span className="opacity-50 ml-2">Cycle {pomodorosCompleted % sessionsBeforeLongBreak + 1}/{sessionsBeforeLongBreak}</span>
                  </div>
                </div>
              )}

              {/* Timer Hero with Progress Ring */}
              <div className="flex flex-col items-center text-center mb-10 md:mb-14">
                {/* Progress Ring Wrapper */}
                {pomodoroMode ? (() => {
                  let progress = 0;
                  let targetSeconds = 0;
                  if (pomodoroPhase === "work") {
                    targetSeconds = workDuration * 60;
                    if (activeSession) {
                      progress = Math.min(1, (getLive(activeSession) + pomodoroAccumulated) / targetSeconds);
                    } else if (isPaused) {
                      progress = Math.min(1, pomodoroAccumulated / targetSeconds);
                    }
                  } else {
                    targetSeconds = (pomodoroPhase === "long_break" ? longBreakDuration : shortBreakDuration) * 60;
                    if (breakStartTime) {
                      progress = Math.min(1, getElapsed(breakStartTime) / targetSeconds);
                    }
                  }
                  const radius = 130;
                  const stroke = 4;
                  const normalizedRadius = radius - stroke;
                  const circumference = normalizedRadius * 2 * Math.PI;
                  const strokeDashoffset = circumference - progress * circumference;
                  const ringColor = pomodoroPhase === "work" ? "rgba(124, 58, 237, 0.7)" : "rgba(96, 165, 250, 0.7)";
                  const glowColor = pomodoroPhase === "work" ? "rgba(124, 58, 237, 0.3)" : "rgba(96, 165, 250, 0.3)";

                  return (
                    <div className="relative flex items-center justify-center mb-3">
                      <svg width={radius * 2} height={radius * 2} className="absolute pointer-events-none" style={{ transform: "rotate(-90deg)" }}>
                        {/* Track */}
                        <circle
                          stroke="rgba(255,255,255,0.04)"
                          fill="transparent"
                          strokeWidth={stroke}
                          r={normalizedRadius}
                          cx={radius}
                          cy={radius}
                        />
                        {/* Progress */}
                        <circle
                          stroke={ringColor}
                          fill="transparent"
                          strokeWidth={stroke}
                          strokeLinecap="round"
                          strokeDasharray={`${circumference} ${circumference}`}
                          style={{ strokeDashoffset, transition: "stroke-dashoffset 1s linear", filter: `drop-shadow(0 0 6px ${glowColor})` }}
                          r={normalizedRadius}
                          cx={radius}
                          cy={radius}
                        />
                      </svg>
                      <div className={`timer-display ${isRunning ? (pomodoroPhase === "work" ? "text-primary text-glow" : "text-blue-400 [text-shadow:0_0_30px_rgba(96,165,250,0.4)]") : "text-muted-foreground/70"}`}>
                        {displayTime}
                      </div>
                    </div>
                  );
                })() : (
                  <div className={`timer-display mb-3 ${isRunning ? "text-primary text-glow" : "text-muted-foreground/70"}`}>
                    {displayTime}
                  </div>
                )}
                <p className="text-xs font-mono text-muted-foreground/70 mb-8 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {formatDuration(view.sub.total_cumulative_time)} total
                </p>
                
                <div className="relative z-10 flex items-center gap-4">
                  {isRunning ? (
                    pomodoroPhase === "work" ? (
                      <>
                        {activeSession?.is_paused ? (
                          <button
                            onClick={() => handleResumeTimer(activeSession.id)}
                            className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 glow-primary transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                          >
                            <Play className="w-6 h-6 md:w-7 md:h-7 text-primary fill-primary ml-0.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePauseTimer(activeSession!.id)}
                            className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center hover:bg-amber-500/20 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                          >
                            <Pause className="w-6 h-6 md:w-7 md:h-7 text-amber-400 fill-amber-400" />
                          </button>
                        )}
                        <button
                          onClick={() => handleStopTimer(activeSession!.id)}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                        >
                          <Square className="w-6 h-6 md:w-7 md:h-7 text-red-400 fill-red-400" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={skipBreak}
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/20 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                      >
                        <FastForward className="w-6 h-6 md:w-7 md:h-7 text-blue-400 fill-blue-400" />
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => {
                        setIsPaused(false);
                        handleStartTimer(view.sub.id);
                      }}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 glow-primary transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-[0_0_20px_rgba(124,58,237,0.3)]"
                    >
                      <Play className="w-6 h-6 md:w-7 md:h-7 text-primary fill-primary ml-0.5" />
                    </button>
                  )}
                </div>
                
                {pomodoroMode && showSnail && (() => {
                  let elapsed = 0;
                  if (pomodoroPhase === "work") {
                    if (activeSession) {
                      elapsed = getLive(activeSession) + pomodoroAccumulated;
                    } else if (isPaused) {
                      elapsed = pomodoroAccumulated;
                    }
                  } else {
                    if (breakStartTime) {
                      elapsed = getElapsed(breakStartTime);
                    }
                  }
                  return (
                    <div className="w-full relative mt-8 mb-[-40px] h-[50px]">
                      <SnailTimer
                        key={`${pomodoroPhase}-${activeSessions.length > 0 ? activeSessions[0].id : 'stopped'}-${activeSession?.is_paused ? 'paused' : 'playing'}`}
                        started={isRunning && !activeSession?.is_paused}
                        initialSeconds={pomodoroPhase === "work" ? workDuration * 60 : (pomodoroPhase === "long_break" ? longBreakDuration * 60 : shortBreakDuration * 60)}
                        elapsedSeconds={elapsed}
                        isBreak={pomodoroPhase !== "work"}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Checklist & Session Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 block px-1 flex items-center gap-1.5">
                      <CheckSquare className="w-3 h-3" /> Checklist
                    </label>
                    <button 
                      onClick={() => {
                        const modes = ["newest", "oldest", "status", "status-oldest"] as const;
                        const idx = modes.indexOf(checklistSort);
                        setChecklistSort(modes[(idx + 1) % modes.length]);
                      }}
                      className="text-[11px] font-medium uppercase tracking-wider flex items-center gap-1.5 text-muted-foreground/60 hover:text-foreground transition-colors px-2 py-1 rounded-md md:hover:bg-surface-overlay"
                    >
                      <ArrowUpDown className="w-3 h-3" />
                      {checklistSort === "newest" ? "Newest First" : 
                       checklistSort === "oldest" ? "Oldest First" : 
                       checklistSort === "status" ? "Incomplete (Newest)" : 
                       "Incomplete (Oldest)"}
                    </button>
                  </div>
                  <div className="rounded-xl border border-surface-border bg-surface-overlay overflow-hidden">
                    {/* Items */}
                    {currentChecklist.length > 0 && (
                      <div className="flex flex-col">
                        {currentChecklist.map((item) => (
                          <div key={item.id} className="group flex items-center gap-3 px-4 py-2.5 border-b border-surface-border last:border-b-0 md:hover:bg-surface-overlay transition-colors">
                            <button
                              onClick={() => onToggleChecklistItem(item.id, item.done)}
                              className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200",
                                item.done
                                  ? "bg-primary/80 border-primary/60"
                                  : "border-surface-border hover:border-primary/40"
                              )}
                            >
                              {item.done && <Check className="w-3.5 h-3.5 text-surface-text" />}
                            </button>
                            <span className={cn(
                              "text-sm flex-1 transition-all duration-200",
                              item.done ? "line-through text-muted-foreground/70" : "text-foreground/80"
                            )}>{item.text}</span>
                            <button
                              onClick={() => removeChecklistItem(item.id)}
                              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-red-500/10 transition-all"
                            >
                              <X className="w-3 h-3 text-red-400/50" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Add item input */}
                    <div className="flex items-center gap-2 px-4 py-2.5">
                      <Plus className="w-4 h-4 text-muted-foreground/70 shrink-0" />
                      <input
                        type="text"
                        value={newChecklistItem}
                        onChange={(e) => setNewChecklistItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addChecklistItem();
                        }}
                        placeholder="Add an item..."
                        className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/70 text-foreground/80"
                      />
                    </div>
                    {/* Progress */}
                    {currentChecklist.length > 0 && (() => {
                      const done = currentChecklist.filter(i => i.done).length;
                      const total = currentChecklist.length;
                      const pct = Math.round((done / total) * 100);
                      return (
                        <div className="px-4 py-2 border-t border-surface-border flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-surface-overlay overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-mono text-muted-foreground/70">{done}/{total}</span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-2 block px-1 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3" /> Session Journal
                  </label>
                  <div className="rounded-xl border border-surface-border bg-surface-overlay overflow-hidden flex flex-col" style={{ minHeight: "120px" }}>
                    {/* Input at top */}
                    {isWorkRunning ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border">
                        <span className="text-sm font-mono text-primary/50 shrink-0">{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                        <input
                          type="text"
                          value={newJournalEntry}
                          onChange={(e) => setNewJournalEntry(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addJournalEntry();
                          }}
                          onFocus={(e) => {
                            setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
                          }}
                          placeholder="What are you doing right now?"
                          className="w-full bg-transparent border-none outline-none text-base sm:text-sm placeholder:text-muted-foreground/70 text-foreground/80"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center px-4 py-3 border-b border-surface-border">
                        <p className="text-sm text-muted-foreground/70">Start a session to log thoughts</p>
                      </div>
                    )}
                    {/* Entries feed */}
                    <div className="flex-1 overflow-y-auto max-h-[200px]">
                      {currentJournal.length === 0 ? (
                        <div className="flex items-center justify-center py-6">
                          <p className="text-xs text-muted-foreground/70">No entries yet</p>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          {[...currentJournal].reverse().map((entry) => (
                            <div key={entry.id} className="flex items-start gap-2.5 px-4 py-2 border-b border-surface-border last:border-b-0">
                              <span className="text-sm font-mono text-primary/40 shrink-0 pt-0.5">{entry.time}</span>
                              <span className="text-sm text-foreground/60 leading-relaxed">{entry.text}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Session History */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-4">
                  Session History
                </h3>

                {subTaskHistory.length === 0 ? (
                  <div className="rounded-xl border border-surface-border bg-surface-overlay py-10 text-center">
                    <p className="text-sm text-muted-foreground/70">No completed sessions yet</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-surface-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-surface-border text-muted-foreground/70 text-sm uppercase tracking-wider">
                            <th className="text-left px-4 py-3 font-medium">Date</th>
                            <th className="text-left px-4 py-3 font-medium">Start</th>
                            <th className="text-left px-4 py-3 font-medium">End</th>
                            <th className="text-left px-4 py-3 font-medium">Notes</th>
                            <th className="text-right px-4 py-3 font-medium">Duration</th>
                            <th className="text-right px-4 py-3 font-medium w-20"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {subTaskHistory.map((session) => (
                            <tr key={session.id} className="border-b border-surface-border md:hover:bg-surface-overlay transition-colors group">
                              <td className="px-4 py-3 text-muted-foreground/60">{new Date(session.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/80">{new Date(session.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/80">{session.end_time ? new Date(session.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground/70 max-w-[200px] truncate text-xs cursor-help" title={session.session_notes || ""}>{session.session_notes ? session.session_notes.split('\n')[0] + (session.session_notes.includes('\n') ? '...' : '') : "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-foreground/70">{formatDuration(session.duration)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                                  {session.end_time && (
                                    <button onClick={() => handleEditSession(session)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded md:hover:bg-surface-overlay-hover">
                                      <Pencil className="w-3 h-3 text-muted-foreground/70" />
                                    </button>
                                  )}
                                  <button onClick={() => setDeleteConfirm({ type: "session", id: session.id, name: "this session" })} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-500/10">
                                    <Trash2 className="w-3 h-3 text-red-400/50" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile */}
                    <div className="md:hidden flex flex-col gap-2">
                      {subTaskHistory.map((session) => (
                        <div key={session.id} className="rounded-xl border border-surface-border bg-surface-overlay px-4 py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-muted-foreground/70">
                                {new Date(session.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {" · "}
                                {new Date(session.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {session.session_notes && <p className="text-xs text-muted-foreground/70 mt-0.5 truncate max-w-[200px]" title={session.session_notes}>{session.session_notes.split('\n')[0] + (session.session_notes.includes('\n') ? '...' : '')}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-foreground/70">{formatDuration(session.duration)}</span>
                              <button onClick={() => handleEditSession(session)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded md:hover:bg-surface-overlay-hover"><Pencil className="w-3 h-3 text-muted-foreground/70" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "session", id: session.id, name: "this session" })} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-red-500/10"><Trash2 className="w-3 h-3 text-red-400/40" /></button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </main>

      {/* ═══════ Context Menu ═══════ */}
      {contextMenu && (
        <div
          className="fixed z-[100] min-w-[160px] rounded-xl border border-surface-border bg-card/95 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setRenamingId(contextMenu.id); setRenameValue(contextMenu.name); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm md:hover:bg-surface-overlay-hover transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground/60" /> Rename
          </button>
          <button
            onClick={() => { setDeleteConfirm({ type: contextMenu.type, id: contextMenu.id, name: contextMenu.name }); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}

      {/* ═══════ Modals ═══════ */}

      {/* Conflict */}
      <Dialog open={conflictModalOpen} onOpenChange={setConflictModalOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-surface-border">
          <DialogHeader>
            <DialogTitle>Timer Running</DialogTitle>
            <DialogDescription className="text-muted-foreground/60 text-sm">You have an active timer. How should we proceed?</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button onClick={handleStartWithPause} className="w-full h-11">Switch Timer</Button>
            <Button variant="secondary" onClick={handleStartConcurrent} className="w-full h-11">Run Both</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-sm bg-card border-surface-border">
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirm?.type === "project" ? "Project" : deleteConfirm?.type === "subtask" ? "Task" : "Session"}</DialogTitle>
            <DialogDescription className="text-muted-foreground/60 text-sm">
              Are you sure you want to delete <strong className="text-foreground/80">{deleteConfirm?.name}</strong>?
              {deleteConfirm?.type === "project" && " This will delete all tasks and sessions inside it."}
              {" "}This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)} className="flex-1 h-10">Cancel</Button>
            <Button variant="destructive" onClick={doDelete} className="flex-1 h-10">Delete</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Session */}
      <Dialog open={editSessionOpen} onOpenChange={setEditSessionOpen}>
        <DialogContent className="sm:max-w-sm bg-card border-surface-border">
          <DialogHeader><DialogTitle>Edit Session</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 mt-4">
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Start Time</label>
              <Input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="bg-surface-overlay border-surface-border" />
            </div>
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">End Time</label>
              <Input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="bg-surface-overlay border-surface-border" />
            </div>
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duration (seconds)</label>
              <Input type="number" value={editDurationStr} onChange={(e) => setEditDurationStr(e.target.value)} className="bg-surface-overlay border-surface-border" />
            </div>
            <Button onClick={submitEditSession} className="w-full h-11 mt-1">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden bg-card border-surface-border">
          <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-6 mt-4">

            {/* Theme Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-amber-500" />}
                <span className="text-sm font-medium">Appearance</span>
              </div>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                <button
                  onClick={() => setTheme("light")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors",
                    theme === "light" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sun className="w-3 h-3" /> Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors",
                    theme === "dark" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Moon className="w-3 h-3" /> Dark
                </button>
              </div>
            </div>

            {/* Pomodoro Settings */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center justify-between">
                Pomodoro Timer
                <div 
                  onClick={() => setPomodoroMode(!pomodoroMode)}
                  className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors border border-surface-border ${pomodoroMode ? 'bg-primary/80 border-primary/80' : 'bg-black/10 dark:bg-white/10'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${pomodoroMode ? 'translate-x-[14px]' : 'translate-x-0'} shadow-sm`} />
                </div>
              </h4>
              
              {pomodoroMode && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Use Pro Time Pickers</span>
                  <div 
                    onClick={() => setUseProTimePicker(!useProTimePicker)}
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors border border-surface-border ${useProTimePicker ? 'bg-primary/80 border-primary/80' : 'bg-black/10 dark:bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useProTimePicker ? 'translate-x-[14px]' : 'translate-x-0'} shadow-sm`} />
                  </div>
                </div>
              )}

              {pomodoroMode && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                  {!useProTimePicker ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Work (min)</label>
                        <Input type="number" value={workDuration} onChange={(e) => setWorkDuration(Number(e.target.value))} className="text-base sm:text-sm bg-surface-overlay" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Short Break (min)</label>
                        <Input type="number" value={shortBreakDuration} onChange={(e) => setShortBreakDuration(Number(e.target.value))} className="text-base sm:text-sm bg-surface-overlay" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Long Break (min)</label>
                        <Input type="number" value={longBreakDuration} onChange={(e) => setLongBreakDuration(Number(e.target.value))} className="text-base sm:text-sm bg-surface-overlay" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Cycles before Long Break</label>
                        <Input type="number" value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="text-base sm:text-sm bg-surface-overlay" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center mt-2 pb-4">
                      {/* Tabs */}
                      <div className="flex items-center gap-2 mb-6 bg-surface-overlay p-1 rounded-lg w-full max-w-[320px]">
                        <button 
                          onClick={() => setActiveProTab("work")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "work" ? "bg-primary/20 text-primary" : "text-muted-foreground/60 md:hover:bg-surface-overlay"}`}
                        >
                          Work
                        </button>
                        <button 
                          onClick={() => setActiveProTab("short")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "short" ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground/60 md:hover:bg-surface-overlay"}`}
                        >
                          Short
                        </button>
                        <button 
                          onClick={() => setActiveProTab("long")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "long" ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground/60 md:hover:bg-surface-overlay"}`}
                        >
                          Long
                        </button>
                      </div>

                      {/* Active Picker */}
                      <div className="flex justify-center items-center w-full px-4 mb-4">
                        <UnifiedTimeWheelPicker
                            workDuration={workDuration}
                            shortDuration={shortBreakDuration}
                            longDuration={longBreakDuration}
                            onWorkChange={setWorkDuration}
                            onShortChange={setShortBreakDuration}
                            onLongChange={setLongBreakDuration}
                            activeMode={activeProTab}
                            onActiveModeChange={setActiveProTab}
                          />
                      </div>

                      <div className="w-full mt-8">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Cycles before Long Break</label>
                        <Input type="number" value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="text-base sm:text-sm bg-surface-overlay" />
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {pomodoroMode && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Show Snail Animation</span>
                  <div 
                    onClick={() => setShowSnail(!showSnail)}
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors border border-surface-border ${showSnail ? 'bg-primary/80 border-primary/80' : 'bg-black/10 dark:bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showSnail ? 'translate-x-[14px]' : 'translate-x-0'} shadow-sm`} />
                  </div>
                </div>
              )}
            </div>



            {/* Save Button */}
            <div className="pt-4 pb-2">
              <Button 
                onClick={() => setSettingsOpen(false)} 
                className="w-full rounded-xl font-medium shadow-md shadow-primary/20 hover:shadow-primary/30 transition-all"
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Intent Mode Selection Dialog */}
      <Dialog open={intentPromptOpen} onOpenChange={setIntentPromptOpen}>
        <DialogContent className="sm:max-w-md bg-card border-surface-border">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-medium tracking-tight">Choose Timer Mode</DialogTitle>
            <DialogDescription className="text-center text-muted-foreground/60">
              How do you want to track &quot;{intentValue}&quot;?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <button
              onClick={() => handleStartIntent("pomodoro")}
              disabled={isStartingIntent}
              className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/[0.05] hover:bg-primary/[0.1] transition-colors disabled:opacity-50"
            >
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold text-primary text-lg">Pomodoro Focus</span>
                <span className="text-sm text-muted-foreground">Cycles of deep work and breaks</span>
              </div>
              <Timer className="w-6 h-6 text-primary/70" />
            </button>
            <button
              onClick={() => handleStartIntent("normal")}
              disabled={isStartingIntent}
              className="flex items-center justify-between p-4 rounded-xl border border-surface-border bg-surface-overlay md:hover:bg-surface-overlay-hover transition-colors disabled:opacity-50"
            >
              <div className="flex flex-col items-start text-left">
                <span className="font-semibold text-foreground text-lg">Normal Timer</span>
                <span className="text-sm text-muted-foreground">Standard uninterrupted countdown</span>
              </div>
              <Clock className="w-6 h-6 text-muted-foreground" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
