"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ParentTask, SubTask, Session, ChecklistItem } from "@prisma/client";
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
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type FullParentTask = ParentTask & { subTasks: SubTask[]; checklists: ChecklistItem[] };
type FullSession = Session & { subTask: SubTask & { parentTask: ParentTask } };

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
  | { kind: "timer"; parent: FullParentTask; sub: SubTask };

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
}: {
  initialTasks: FullParentTask[];
  initialActiveSessions: FullSession[];
  initialTodaySessions: Session[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tasks, setTasks] = useState(initialTasks);
  const [activeSessions, setActiveSessions] = useState(initialActiveSessions);
  const [todaySessions, setTodaySessions] = useState(initialTodaySessions);
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
        const sub = parent.subTasks.find(s => s.id === savedView.subId);
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
      for (const sub of parent.subTasks) {
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

  const currentChecklist = useMemo(() => {
    if (view.kind !== "timer") return [];
    return view.parent.checklists || [];
  }, [view]);

  const addChecklistItem = async () => {
    if (!newChecklistItem.trim() || view.kind !== "timer") return;
    await createChecklistItem(view.parent.id, newChecklistItem.trim());
    setNewChecklistItem("");
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
    if (!currentDone) playPing();
    await toggleChecklistItem(itemId, !currentDone);
    refresh();
  };

  const removeChecklistItem = async (itemId: string) => {
    if (view.kind !== "timer") return;
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
    await updateSessionNotes(currentSessionId, notesString);
    refresh();
  };

  // ─── Pomodoro State ──────────────────────────────────────────────────────
  const [pomodoroMode, setPomodoroMode] = useLocalStorage("fs_pomodoroMode", false);
  const [showSnail, setShowSnail] = useLocalStorage("fs_showSnail", true);
  const [useProTimePicker, setUseProTimePicker] = useLocalStorage("fs_pro_time_picker", false);
  const [activeProTab, setActiveProTab] = useState<TimerMode>("work");
  const [workDuration, setWorkDuration] = useLocalStorage("fs_workDuration", 25);
  const [shortBreakDuration, setShortBreakDuration] = useLocalStorage("fs_shortBreakDuration", 5);
  const [longBreakDuration, setLongBreakDuration] = useLocalStorage("fs_longBreakDuration", 15);
  const [sessionsBeforeLongBreak, setSessionsBeforeLongBreak] = useLocalStorage("fs_sessionsBeforeLongBreak", 4);

  const [pomodoroPhase, setPomodoroPhase] = useLocalStorage<"work" | "short_break" | "long_break">("fs_phase", "work");
  const [pomodorosCompleted, setPomodorosCompleted] = useLocalStorage("fs_completed", 0);
  const [breakStartTime, setBreakStartTime] = useLocalStorage<string | null>("fs_breakStart", null);
  const [pomodoroAccumulated, setPomodoroAccumulated] = useLocalStorage("fs_accumulated", 0);
  const [isPaused, setIsPaused] = useLocalStorage("fs_isPaused", false);

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
  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);
  useEffect(() => { setActiveSessions(initialActiveSessions); }, [initialActiveSessions]);
  useEffect(() => { setTodaySessions(initialTodaySessions); }, [initialTodaySessions]);

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
  const refresh = useCallback(() => { startTransition(() => { router.refresh(); }); }, [router]);

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
        const parent = tasks.find((t) => t.subTasks.some((s) => s.id === deleteConfirm.id));
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
        await startSession(subTaskId);
        setIsPaused(false);
        setIsProcessing(false);
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
        const newInbox = await createParentTask("Inbox") as FullParentTask;
        inbox = newInbox;
        // Optimistic update to prevent being kicked out by the sync useEffect
        setTasks(prev => [...prev, newInbox]);
      }
      
      // 2. Create subtask
      const subtask = await createSubTask(inbox.id, intentValue.trim());
      
      // Optimistic update
      setTasks(prev => prev.map(p => {
        if (p.id === inbox.id) {
          return { ...p, subTasks: [...p.subTasks, subtask] };
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
    for (const s of activeSessions) await stopSession(s.id);
    if (pendingSubTaskId) await startSession(pendingSubTaskId);
    setConflictModalOpen(false);
    refresh();
  };

  const handleStartConcurrent = async () => {
    if (pendingSubTaskId) await startSession(pendingSubTaskId);
    setConflictModalOpen(false);
    refresh();
  };

  const handleStopTimer = async (sessionId: string, autoPomodoroTransition = false) => {
    setIsProcessing(true);
    setIsPaused(false);
    await stopSession(sessionId);
    
    if (pomodoroMode) {
      if (!autoPomodoroTransition) {
        // Manual stop - reset to work phase just to be safe
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
    await pauseSession(sessionId);
    refresh();
  };

  const handleResumeTimer = async (sessionId: string) => {
    setIsPaused(false);
    await resumeSession(sessionId);
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
    setContextMenu({ id, type, name, x: e.clientX, y: e.clientY });
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
    color1: "#030014", // Very dark background
    color2: "#150530", // Dark purple
    color3: "#401060", // Subtle deep primary purple
    speed: 0.8,        // Faster speed
    distortion: 20,
    scale: 0.8,
  }), []);

  const breakGradientConfig = useMemo(() => ({
    preset: "custom" as const,
    color1: "#000514", // Very dark background
    color2: "#051530", // Dark blue
    color3: "#103060", // Subtle deep break blue
    speed: 0.8,        // Faster speed
    distortion: 20,
    scale: 0.8,
  }), []);

  return (
    <div className="relative min-h-[100dvh] w-full bg-transparent text-foreground isolate">
      <AnimatedGradient 
        config={workGradientConfig}
        className={`fixed inset-0 z-[-1] transition-opacity duration-[5000ms] ease-in-out pointer-events-none ${pomodoroPhase === "work" ? "opacity-30" : "opacity-0"}`}
      />
      <AnimatedGradient 
        config={breakGradientConfig}
        className={`fixed inset-0 z-[-1] transition-opacity duration-[5000ms] ease-in-out pointer-events-none ${pomodoroPhase !== "work" ? "opacity-30" : "opacity-0"}`}
      />

      {/* ═══════ Top Bar ═══════ */}
      <header className="sticky top-0 z-40 glass-surface">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 md:px-8 h-14">
          <div className="flex items-center gap-3">
            {view.kind !== "projects" && (
              <button
                onClick={() => {
                  if (view.kind === "timer") setView({ kind: "project", parent: view.parent });
                  else setView({ kind: "projects" });
                }}
                className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-muted-foreground" />
              </button>
            )}

            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm">
              <button
                onClick={() => setView({ kind: "projects" })}
                className={`font-semibold tracking-tight transition-colors flex items-center gap-1.5 ${view.kind === "projects" ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
              >
                <Timer className="w-4 h-4 text-primary" />
                FlowState
              </button>
              {view.kind !== "projects" && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/70" />
                  <button
                    onClick={() => setView({ kind: "project", parent: view.parent })}
                    className={`truncate max-w-[120px] md:max-w-[200px] transition-colors ${view.kind === "project" ? "text-foreground font-medium" : "text-muted-foreground/60 hover:text-muted-foreground"}`}
                  >
                    {view.parent.name}
                  </button>
                </>
              )}
              {view.kind === "timer" && (
                <>
                  <ChevronRight className="w-3 h-3 text-muted-foreground/70" />
                  <span className="text-foreground font-medium truncate max-w-[120px] md:max-w-[200px]">
                    {view.sub.name}
                  </span>
                </>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {/* Active timer pill */}
            {activeSessions.length > 0 && view.kind !== "timer" && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {activeSessions.length} active
              </div>
            )}
            <button
              onClick={() => setSettingsOpen(true)}
              className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* ═══════ Content ═══════ */}
      <main className="max-w-5xl mx-auto px-4 md:px-8 pb-12">

        {/* ─── Projects View ─── */}
        {view.kind === "projects" && (
          <div className={cn("pt-8 transition duration-300 ease-out", isTransitioning ? "opacity-0 translate-x-[-20px]" : "opacity-100 translate-x-0")}>
            
            {/* ─── Current Intent Field ─── */}
            <div className="mb-14 relative max-w-2xl mx-auto group">
              <div className="absolute inset-0 bg-primary/20 blur-[60px] rounded-full opacity-0 group-focus-within:opacity-40 transition-opacity duration-1000 pointer-events-none" />
              <div className="relative z-10 flex items-center bg-[#050505]/60 backdrop-blur-2xl border border-white/[0.05] hover:border-white/[0.1] focus-within:border-primary/30 rounded-full shadow-2xl transition-all duration-500 h-16 sm:h-20 px-3 overflow-hidden">
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
                  className="w-full h-full text-xl sm:text-2xl bg-transparent border-none outline-none focus-visible:ring-1 focus-visible:ring-primary/50 placeholder:text-muted-foreground/70 text-white font-medium tracking-tight px-6"
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
                      : "bg-white/[0.03] text-white/20 shadow-none"
                  )}
                >
                  {isStartingIntent ? <span className="animate-spin text-xl">⏳</span> : <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
                </button>
              </div>

              {/* ─── Autocomplete Suggestions Dropdown ─── */}
              {intentFocused && intentSuggestions.length > 0 && !selectedExistingTask && (
                <div className="absolute z-30 left-0 right-0 top-full mt-2 mx-4 sm:mx-6 rounded-2xl bg-[#0a0a0c]/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/[0.04]">
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
                        i === highlightedIndex ? "bg-primary/10" : "hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center shrink-0">
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
            <div className="flex items-center justify-center gap-6 sm:gap-10 mb-10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-foreground font-mono">{formatShort(todayTotalSeconds)}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/70 font-medium">Today</p>
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-foreground font-mono">{todaySessionCount}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/70 font-medium">Sessions</p>
                </div>
              </div>
              <div className="w-px h-8 bg-white/[0.06]" />
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-foreground font-mono">{tasks.length}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground/70 font-medium">Projects</p>
                </div>
              </div>
            </div>

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
                <button onClick={() => setShowAddProject(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/[0.06]"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {tasks.length === 0 && !showAddProject ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                  <FolderOpen className="w-8 h-8 text-muted-foreground/70" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground/70">No projects yet</h3>
                <p className="text-sm text-muted-foreground/70 max-w-[280px]">Create your first project to start tracking time</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((parent) => {
                  const hasActive = activeSessions.some((s) => parent.subTasks.some((sub) => sub.id === s.sub_task_id));
                  return (
                    <div
                      key={parent.id}
                      onClick={() => setView({ kind: "project", parent })}
                      onContextMenu={(e) => openContext(e, parent.id, "project", parent.name)}
                      className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] p-5 cursor-pointer transition-all duration-200"
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
                              className="h-7 text-sm bg-transparent border-white/[0.1] w-full"
                            />
                          ) : (
                            <h3 className="font-semibold text-[15px] tracking-tight truncate">{parent.name}</h3>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); openContext(e, parent.id, "project", parent.name); }}
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/80" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground/80">
                        <span>{parent.subTasks.length} {parent.subTasks.length === 1 ? "task" : "tasks"}</span>
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
              {formatShort(view.parent.total_cumulative_time)} tracked across {view.parent.subTasks.length} tasks
            </p>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-2 block px-1">
                Project Notes
              </label>
              <Textarea
                className="min-h-[100px] resize-none bg-white/[0.02] border-white/[0.06] text-sm leading-relaxed placeholder:text-muted-foreground/70 focus-visible:ring-primary/20 rounded-xl"
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
                <button onClick={() => setShowAddSubTask(false)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/[0.06]"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {view.parent.subTasks.length === 0 && !showAddSubTask ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
                  <FileText className="w-6 h-6 text-muted-foreground/70" />
                </div>
                <h3 className="text-base font-semibold mb-1 text-foreground/70">No tasks yet</h3>
                <p className="text-sm text-muted-foreground/70">Add a task to start tracking</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {view.parent.subTasks.map((sub) => {
                  const active = activeForSub(sub.id);
                  return (
                    <div
                      key={sub.id}
                      onClick={() => setView({ kind: "timer", parent: view.parent, sub })}
                      onContextMenu={(e) => openContext(e, sub.id, "subtask", sub.name)}
                      className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] px-5 py-4 cursor-pointer transition-all duration-200"
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
                              className="h-7 text-sm bg-transparent border-white/[0.1] w-full max-w-xs"
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
                          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded opacity-100 md:opacity-0 md:group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
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
                      <svg width={radius * 2} height={radius * 2} className="absolute" style={{ transform: "rotate(-90deg)" }}>
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
                
                <div className="flex items-center gap-4">
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
                        key={`${pomodoroPhase}-${activeSessions.length > 0 ? activeSessions[0].id : 'stopped'}`}
                        started={isRunning}
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
                  <label className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/70 mb-2 block px-1 flex items-center gap-1.5">
                    <CheckSquare className="w-3 h-3" /> Checklist
                  </label>
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                    {/* Items */}
                    {currentChecklist.length > 0 && (
                      <div className="flex flex-col">
                        {currentChecklist.map((item) => (
                          <div key={item.id} className="group flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors">
                            <button
                              onClick={() => onToggleChecklistItem(item.id, item.done)}
                              className={cn(
                                "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all duration-200",
                                item.done
                                  ? "bg-primary/80 border-primary/60"
                                  : "border-white/[0.15] hover:border-primary/40"
                              )}
                            >
                              {item.done && <Check className="w-3 h-3 text-white" />}
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
                        <div className="px-4 py-2 border-t border-white/[0.04] flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
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
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden flex flex-col" style={{ minHeight: "120px" }}>
                    {/* Input at top */}
                    {isWorkRunning ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.04]">
                        <span className="text-sm font-mono text-primary/50 shrink-0">{new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
                        <input
                          type="text"
                          value={newJournalEntry}
                          onChange={(e) => setNewJournalEntry(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addJournalEntry();
                          }}
                          placeholder="What are you doing right now?"
                          className="w-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/70 text-foreground/80"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center justify-center px-4 py-3 border-b border-white/[0.04]">
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
                            <div key={entry.id} className="flex items-start gap-2.5 px-4 py-2 border-b border-white/[0.02] last:border-b-0">
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
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] py-10 text-center">
                    <p className="text-sm text-muted-foreground/70">No completed sessions yet</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-white/[0.04] overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/[0.04] text-muted-foreground/70 text-sm uppercase tracking-wider">
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
                            <tr key={session.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors group">
                              <td className="px-4 py-3 text-muted-foreground/60">{new Date(session.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/80">{new Date(session.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/80">{session.end_time ? new Date(session.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground/70 max-w-[200px] truncate text-xs cursor-help" title={session.session_notes || ""}>{session.session_notes ? session.session_notes.split('\n')[0] + (session.session_notes.includes('\n') ? '...' : '') : "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-foreground/70">{formatDuration(session.duration)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all">
                                  {session.end_time && (
                                    <button onClick={() => handleEditSession(session)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/[0.06]">
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
                        <div key={session.id} className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
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
                              <button onClick={() => handleEditSession(session)} className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded hover:bg-white/[0.06]"><Pencil className="w-3 h-3 text-muted-foreground/70" /></button>
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
          className="fixed z-[100] min-w-[160px] rounded-xl border border-white/[0.08] bg-card/95 backdrop-blur-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => { setRenamingId(contextMenu.id); setRenameValue(contextMenu.name); setContextMenu(null); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-white/[0.06] transition-colors"
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
        <DialogContent className="sm:max-w-sm bg-card border-white/[0.08]">
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
        <DialogContent className="sm:max-w-sm bg-card border-white/[0.08]">
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
        <DialogContent className="sm:max-w-sm bg-card border-white/[0.08]">
          <DialogHeader><DialogTitle>Edit Session</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-4 mt-4">
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Start Time</label>
              <Input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">End Time</label>
              <Input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <div>
              <label className="text-sm font-medium uppercase tracking-wider text-muted-foreground/70 mb-1.5 block">Duration (seconds)</label>
              <Input type="number" value={editDurationStr} onChange={(e) => setEditDurationStr(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <Button onClick={submitEditSession} className="w-full h-11 mt-1">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden bg-card border-white/[0.08]">
          <DialogHeader><DialogTitle>Settings</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-6 mt-4">
            
            {/* Pomodoro Settings */}
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center justify-between">
                Pomodoro Timer
                <div 
                  onClick={() => setPomodoroMode(!pomodoroMode)}
                  className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${pomodoroMode ? 'bg-primary/80' : 'bg-white/[0.1]'}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${pomodoroMode ? 'translate-x-4' : ''}`} />
                </div>
              </h4>
              
              {pomodoroMode && (
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Use Pro Time Pickers</span>
                  <div 
                    onClick={() => setUseProTimePicker(!useProTimePicker)}
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${useProTimePicker ? 'bg-primary/80' : 'bg-white/[0.1]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${useProTimePicker ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
              )}

              {pomodoroMode && (
                <div className="mt-3 animate-in fade-in slide-in-from-top-2">
                  {!useProTimePicker ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Work (min)</label>
                        <Input type="number" value={workDuration} onChange={(e) => setWorkDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Short Break (min)</label>
                        <Input type="number" value={shortBreakDuration} onChange={(e) => setShortBreakDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Long Break (min)</label>
                        <Input type="number" value={longBreakDuration} onChange={(e) => setLongBreakDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                      </div>
                      <div>
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Cycles before Long Break</label>
                        <Input type="number" value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center mt-2 pb-4">
                      {/* Tabs */}
                      <div className="flex items-center gap-2 mb-6 bg-white/[0.02] p-1 rounded-lg w-full max-w-[320px]">
                        <button 
                          onClick={() => setActiveProTab("work")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "work" ? "bg-primary/20 text-primary" : "text-muted-foreground/60 hover:bg-white/[0.04]"}`}
                        >
                          Work
                        </button>
                        <button 
                          onClick={() => setActiveProTab("short")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "short" ? "bg-blue-500/20 text-blue-400" : "text-muted-foreground/60 hover:bg-white/[0.04]"}`}
                        >
                          Short
                        </button>
                        <button 
                          onClick={() => setActiveProTab("long")} 
                          className={`flex-1 py-1.5 text-sm font-semibold uppercase tracking-wider rounded-md transition-colors ${activeProTab === "long" ? "bg-purple-500/20 text-purple-400" : "text-muted-foreground/60 hover:bg-white/[0.04]"}`}
                        >
                          Long
                        </button>
                      </div>

                      {/* Active Picker */}
                      <div className="flex justify-center items-center h-[300px] sm:h-[360px] w-full max-w-full">
                        <div className="transform scale-[0.82] sm:scale-100 origin-center">
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
                      </div>

                      <div className="w-full mt-8">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Cycles before Long Break</label>
                        <Input type="number" value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
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
                    className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${showSnail ? 'bg-primary/80' : 'bg-white/[0.1]'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${showSnail ? 'translate-x-4' : ''}`} />
                  </div>
                </div>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">About</h4>
              <p className="text-xs text-muted-foreground/80 leading-relaxed">
                FlowState is a premium minimalist time tracker built for deep work. All data is stored locally on your device.
              </p>
            </div>
            
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-sm text-muted-foreground/70">FlowState v1.0 · Built with Next.js + Prisma</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Intent Mode Selection Dialog */}
      <Dialog open={intentPromptOpen} onOpenChange={setIntentPromptOpen}>
        <DialogContent className="sm:max-w-md bg-card border-white/[0.08]">
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
              className="flex items-center justify-between p-4 rounded-xl border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] transition-colors disabled:opacity-50"
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
