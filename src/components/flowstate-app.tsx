"use client";

import { useState, useEffect, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ParentTask, SubTask, Session } from "@prisma/client";
import {
  startSession,
  stopSession,
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
} from "@/lib/actions";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { SnailTimer } from "./ui/snail-timer";
import { AnimatedGradient } from "./ui/animated-gradient";
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
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type FullParentTask = ParentTask & { subTasks: SubTask[] };
type FullSession = Session & { subTask: SubTask & { parentTask: ParentTask } };

type View =
  | { kind: "projects" }
  | { kind: "project"; parent: FullParentTask }
  | { kind: "timer"; parent: FullParentTask; sub: SubTask };

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
}: {
  initialTasks: FullParentTask[];
  initialActiveSessions: FullSession[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [tasks, setTasks] = useState(initialTasks);
  const [activeSessions, setActiveSessions] = useState(initialActiveSessions);
  const [savedView, setSavedView] = useLocalStorage<{ kind: "projects" | "project" | "timer", parentId?: string, subId?: string }>("fs_savedView", { kind: "projects" });

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

  const setView = useCallback((newView: View) => {
    if (newView.kind === "projects") {
      setSavedView({ kind: "projects" });
    } else if (newView.kind === "project") {
      setSavedView({ kind: "project", parentId: newView.parent.id });
    } else if (newView.kind === "timer") {
      setSavedView({ kind: "timer", parentId: newView.parent.id, subId: newView.sub.id });
    }
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

  // ─── Pomodoro State ──────────────────────────────────────────────────────
  const [pomodoroMode, setPomodoroMode] = useLocalStorage("fs_pomodoroMode", false);
  const [showSnail, setShowSnail] = useLocalStorage("fs_showSnail", true);
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
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
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

  // Keep view in sync with refreshed data
  useEffect(() => {
    if (view.kind === "project") {
      const updated = tasks.find((t) => t.id === view.parent.id);
      if (updated) setView({ kind: "project", parent: updated });
      else setView({ kind: "projects" });
    } else if (view.kind === "timer") {
      const updatedParent = tasks.find((t) => t.id === view.parent.id);
      if (!updatedParent) { setView({ kind: "projects" }); return; }
      const updatedSub = updatedParent.subTasks.find((s) => s.id === view.sub.id);
      if (!updatedSub) { setView({ kind: "project", parent: updatedParent }); return; }
      setView({ kind: "timer", parent: updatedParent, sub: updatedSub });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

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
    if (activeSessions.length > 0) {
      setPendingSubTaskId(subTaskId);
      setConflictModalOpen(true);
    } else {
      if (pomodoroMode && pomodoroPhase !== "work") {
        setBreakStartTime(new Date().toISOString());
      } else {
        await startSession(subTaskId);
        setIsPaused(false);
        refresh();
      }
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
    await stopSession(sessionId);
    
    if (pomodoroMode) {
      if (autoPomodoroTransition && pomodoroPhase === "work") {
        const newCompleted = pomodorosCompleted + 1;
        setPomodorosCompleted(newCompleted);
        const isLongBreak = newCompleted % sessionsBeforeLongBreak === 0;
        setPomodoroPhase(isLongBreak ? "long_break" : "short_break");
        setBreakStartTime(new Date().toISOString());
        setPomodoroAccumulated(0);
        setIsPaused(false);
        toast.success("Focus session complete! Time for a break.");
      } else {
        // Manual stop - reset to work phase just to be safe
        setPomodoroPhase("work");
        setBreakStartTime(null);
        setPomodoroAccumulated(0);
        setIsPaused(false);
      }
    }
    refresh();
  };

  const handlePauseTimer = async (sessionId: string) => {
    const session = activeSessions.find(s => s.id === sessionId);
    if (!session) return;
    const elapsed = getLive(session.start_time);
    await stopSession(sessionId);
    setPomodoroAccumulated(prev => prev + elapsed);
    setIsPaused(true);
    refresh();
  };

  const handleResumeTimer = async (subTaskId: string) => {
    setIsPaused(false);
    await startSession(subTaskId);
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
    if (!editingSession || !editStartTime || !editEndTime || !editDurationStr) return;
    try {
      await updateSessionTime(editingSession.id, new Date(editStartTime), new Date(editEndTime), parseInt(editDurationStr, 10));
      toast.success("Session updated");
      setEditSessionOpen(false);
      refresh();
    } catch { toast.error("Failed to update session"); }
  };

  // ─── Derived ─────────────────────────────────────────────────────────────
  const getLive = useCallback((startTime: string | Date) => 
    Math.max(0, Math.floor((currentTime.getTime() - new Date(startTime).getTime()) / 1000)),
  [currentTime]);

  const activeForSub = (subId: string) => activeSessions.find((s) => s.sub_task_id === subId) ?? null;

  const openContext = (e: React.MouseEvent, id: string, type: "project" | "subtask", name: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ id, type, name, x: e.clientX, y: e.clientY });
  };

  // ─── Timer Interval ──────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);

      if (pomodoroMode) {
        if (pomodoroPhase === "work") {
          const activeSession = activeSessions.find(s => true); // Any active session
          if (activeSession) {
            const elapsed = Math.floor((now.getTime() - new Date(activeSession.start_time).getTime()) / 1000);
            if (elapsed + pomodoroAccumulated >= workDuration * 60) {
              playNotification();
              handleStopTimer(activeSession.id, true);
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
    }, 1000);
    return () => clearInterval(interval);
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
                  <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
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
                  <ChevronRight className="w-3 h-3 text-muted-foreground/30" />
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
              className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
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
          <div className="pt-8">
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
                  className="bg-transparent border-none focus-visible:ring-0 text-sm h-8 placeholder:text-muted-foreground/40"
                />
                <Button size="sm" onClick={doAddProject} className="h-8 rounded-lg px-4 text-xs shrink-0">Create</Button>
                <button onClick={() => setShowAddProject(false)} className="p-1 rounded hover:bg-white/[0.06]"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {tasks.length === 0 && !showAddProject ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="w-20 h-20 rounded-3xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-6">
                  <FolderOpen className="w-8 h-8 text-muted-foreground/20" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-foreground/70">No projects yet</h3>
                <p className="text-sm text-muted-foreground/40 max-w-[280px]">Create your first project to start tracking time</p>
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
                      className="group relative rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] p-5 cursor-pointer transition-all duration-200 active:scale-[0.98]"
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
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/50" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground/50">
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
          <div className="pt-8">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{view.parent.name}</h2>
              <Button
                onClick={() => { setShowAddSubTask(true); setNewSubTaskName(""); }}
                className="h-9 px-4 text-sm rounded-xl gap-2"
              >
                <Plus className="w-4 h-4" /> New Task
              </Button>
            </div>
            <p className="text-sm text-muted-foreground/50 mb-6 font-mono">
              {formatShort(view.parent.total_cumulative_time)} tracked across {view.parent.subTasks.length} tasks
            </p>

            {/* Notes */}
            <div className="mb-6">
              <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-2 block px-1">
                Project Notes
              </label>
              <Textarea
                className="min-h-[100px] resize-none bg-white/[0.02] border-white/[0.06] text-sm leading-relaxed placeholder:text-muted-foreground/25 focus-visible:ring-primary/20 rounded-xl"
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
                  className="bg-transparent border-none focus-visible:ring-0 text-sm h-8 placeholder:text-muted-foreground/40"
                />
                <Button size="sm" onClick={() => doAddSubTask(view.parent.id)} className="h-8 rounded-lg px-4 text-xs shrink-0">Create</Button>
                <button onClick={() => setShowAddSubTask(false)} className="p-1 rounded hover:bg-white/[0.06]"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
              </div>
            )}

            {view.parent.subTasks.length === 0 && !showAddSubTask ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">
                  <FileText className="w-6 h-6 text-muted-foreground/20" />
                </div>
                <h3 className="text-base font-semibold mb-1 text-foreground/70">No tasks yet</h3>
                <p className="text-sm text-muted-foreground/40">Add a task to start tracking</p>
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
                      className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1] px-5 py-4 cursor-pointer transition-all duration-200 active:scale-[0.995]"
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
                            {formatDuration(getLive(active.start_time))} running
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-mono text-muted-foreground/40">{formatShort(sub.total_cumulative_time)}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); openContext(e, sub.id, "subtask", sub.name); }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] transition-all"
                        >
                          <MoreHorizontal className="w-4 h-4 text-muted-foreground/50" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-muted-foreground/20" />
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
                const elapsed = getLive(activeSession.start_time);
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
                const elapsed = getLive(breakStartTime);
                const remaining = Math.max(0, target - elapsed);
                displayTime = formatDuration(remaining);
              } else {
                displayTime = formatDuration(target);
              }
            }
          } else {
            displayTime = activeSession ? formatDuration(getLive(activeSession.start_time)) : formatDuration(0);
          }

          return (
            <div className="pt-6 md:pt-10">
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

              {/* Timer Hero */}
              <div className="flex flex-col items-center text-center mb-10 md:mb-14">
                <div className={`timer-display mb-3 transition-colors duration-500 ${isRunning ? (pomodoroPhase === "work" ? "text-primary text-glow" : "text-blue-400 [text-shadow:0_0_30px_rgba(96,165,250,0.4)]") : "text-muted-foreground/20"}`}>
                  {displayTime}
                </div>
                <p className="text-xs font-mono text-muted-foreground/35 mb-8 flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {formatDuration(view.sub.total_cumulative_time)} total
                </p>
                
                <div className="flex items-center gap-4">
                  {isRunning ? (
                    pomodoroPhase === "work" ? (
                      <>
                        <button
                          onClick={() => handlePauseTimer(activeSession!.id)}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center hover:bg-amber-500/20 transition-all duration-300 active:scale-95"
                        >
                          <Pause className="w-6 h-6 md:w-7 md:h-7 text-amber-400 fill-amber-400" />
                        </button>
                        <button
                          onClick={() => handleStopTimer(activeSession!.id)}
                          className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center hover:bg-red-500/20 transition-all duration-300 active:scale-95"
                        >
                          <Square className="w-6 h-6 md:w-7 md:h-7 text-red-400 fill-red-400" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={skipBreak}
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center hover:bg-blue-500/20 transition-all duration-300 active:scale-95"
                      >
                        <FastForward className="w-6 h-6 md:w-7 md:h-7 text-blue-400 fill-blue-400" />
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => {
                        if (isPaused) handleResumeTimer(view.sub.id);
                        else handleStartTimer(view.sub.id);
                      }}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 glow-primary transition-all duration-300 active:scale-95"
                    >
                      <Play className="w-6 h-6 md:w-7 md:h-7 text-primary fill-primary ml-0.5" />
                    </button>
                  )}
                </div>
                
                {pomodoroMode && showSnail && (() => {
                  let elapsed = 0;
                  if (pomodoroPhase === "work") {
                    if (activeSession) {
                      elapsed = getLive(activeSession.start_time) + pomodoroAccumulated;
                    } else if (isPaused) {
                      elapsed = pomodoroAccumulated;
                    }
                  } else {
                    if (breakStartTime) {
                      elapsed = getLive(breakStartTime);
                    }
                  }
                  return (
                    <div className="w-full relative mt-8 mb-[-40px] h-[50px]">
                      <SnailTimer
                        key={`${pomodorosCompleted}-${pomodoroPhase}`}
                        started={isRunning}
                        initialSeconds={pomodoroPhase === "work" ? workDuration * 60 : (pomodoroPhase === "long_break" ? longBreakDuration * 60 : shortBreakDuration * 60)}
                        elapsedSeconds={elapsed}
                        isBreak={pomodoroPhase !== "work"}
                      />
                    </div>
                  );
                })()}
              </div>

              {/* Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-2 block px-1">Project Notes</label>
                  <Textarea
                    className="min-h-[120px] resize-none bg-white/[0.02] border-white/[0.06] text-sm leading-relaxed placeholder:text-muted-foreground/25 focus-visible:ring-primary/20 rounded-xl"
                    placeholder="Persistent project notes..."
                    defaultValue={view.parent.general_notes || ""}
                    key={`pn2-${view.parent.id}`}
                    onBlur={(e) => updateParentTaskNotes(view.parent.id, e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-2 block px-1">Session Notes</label>
                  <Textarea
                    className="min-h-[120px] resize-none bg-white/[0.02] border-white/[0.06] text-sm leading-relaxed placeholder:text-muted-foreground/25 focus-visible:ring-primary/20 rounded-xl"
                    placeholder={isWorkRunning ? "What are you working on?" : "Start a session to add notes..."}
                    disabled={!isWorkRunning}
                    defaultValue={activeSession?.session_notes || ""}
                    key={`sn-${activeSession?.id || "none"}`}
                    onBlur={(e) => { if (activeSession) updateSessionNotes(activeSession.id, e.target.value); }}
                  />
                </div>
              </div>

              {/* Session History */}
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-muted-foreground/40 mb-4">
                  Session History
                </h3>

                {subTaskHistory.length === 0 ? (
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] py-10 text-center">
                    <p className="text-sm text-muted-foreground/30">No completed sessions yet</p>
                  </div>
                ) : (
                  <>
                    {/* Desktop */}
                    <div className="hidden md:block rounded-xl border border-white/[0.04] overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-white/[0.04] text-muted-foreground/35 text-[11px] uppercase tracking-wider">
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
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/50">{new Date(session.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</td>
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground/50">{session.end_time ? new Date(session.end_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                              <td className="px-4 py-3 text-muted-foreground/40 max-w-[200px] truncate text-xs">{session.session_notes || "—"}</td>
                              <td className="px-4 py-3 text-right font-mono text-xs text-foreground/70">{formatDuration(session.duration)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                  {session.end_time && (
                                    <button onClick={() => handleEditSession(session)} className="p-1 rounded hover:bg-white/[0.06]">
                                      <Pencil className="w-3 h-3 text-muted-foreground/40" />
                                    </button>
                                  )}
                                  <button onClick={() => setDeleteConfirm({ type: "session", id: session.id, name: "this session" })} className="p-1 rounded hover:bg-red-500/10">
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
                              <p className="text-xs text-muted-foreground/45">
                                {new Date(session.start_time).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                {" · "}
                                {new Date(session.start_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                              </p>
                              {session.session_notes && <p className="text-xs text-muted-foreground/30 mt-0.5 truncate max-w-[200px]">{session.session_notes}</p>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm text-foreground/70">{formatDuration(session.duration)}</span>
                              <button onClick={() => handleEditSession(session)} className="p-1 rounded hover:bg-white/[0.06]"><Pencil className="w-3 h-3 text-muted-foreground/30" /></button>
                              <button onClick={() => setDeleteConfirm({ type: "session", id: session.id, name: "this session" })} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="w-3 h-3 text-red-400/40" /></button>
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
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5 block">Start Time</label>
              <Input type="datetime-local" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5 block">End Time</label>
              <Input type="datetime-local" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/40 mb-1.5 block">Duration (seconds)</label>
              <Input type="number" value={editDurationStr} onChange={(e) => setEditDurationStr(e.target.value)} className="bg-white/[0.04] border-white/[0.08]" />
            </div>
            <Button onClick={submitEditSession} className="w-full h-11 mt-1">Save Changes</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Settings */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md bg-card border-white/[0.08]">
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
                <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Work (min)</label>
                    <Input type="number" value={workDuration} onChange={(e) => setWorkDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Short Break (min)</label>
                    <Input type="number" value={shortBreakDuration} onChange={(e) => setShortBreakDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Long Break (min)</label>
                    <Input type="number" value={longBreakDuration} onChange={(e) => setLongBreakDuration(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1.5 block">Cycles before Long Break</label>
                    <Input type="number" value={sessionsBeforeLongBreak} onChange={(e) => setSessionsBeforeLongBreak(Number(e.target.value))} className="h-8 text-sm bg-white/[0.02]" />
                  </div>
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
              <p className="text-xs text-muted-foreground/50 leading-relaxed">
                FlowState is a premium minimalist time tracker built for deep work. All data is stored locally on your device.
              </p>
            </div>
            
            <div className="pt-2 border-t border-white/[0.06]">
              <p className="text-[11px] text-muted-foreground/30">FlowState v1.0 · Built with Next.js + Prisma</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
