const fs = require('fs');
let code = fs.readFileSync('src/components/flowstate-app.tsx', 'utf8');

// 1. Add import
if (!code.includes('useFlowStore')) {
  code = code.replace(
    'import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";',
    'import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";\nimport { useFlowStore } from "@/store/useFlowStore";'
  );
}

// 2. Replace state hooks
code = code.replace(
  /const \[tasks, setTasks\] = useState.*?;\s*const \[activeSessions, setActiveSessions\].*?;\s*const \[todaySessions, setTodaySessions\].*?;\s*const \[recentSubTaskIds, setRecentSubTaskIds\].*?;\s*useEffect\(\(\) => \{[\s\S]*?\}, \[.*?\]\);/,
  `const store = useFlowStore();
  const tasks = store.tasks;
  const setTasks = store.setTasks;
  const activeSessions = store.activeSessions;
  const setActiveSessions = store.setActiveSessions;
  const todaySessions = store.todaySessions;
  const setTodaySessions = store.setTodaySessions;
  const recentSubTaskIds = store.recentSubTaskIds;
  const setRecentSubTaskIds = store.setRecentSubTaskIds;
  
  useEffect(() => {
    store.initialize({
      tasks: initialTasks,
      activeSessions: initialActiveSessions,
      todaySessions: initialTodaySessions,
      pomodoroState: initialPomodoroState || store.pomodoroState,
      recentSubTaskIds: initialRecentSubTaskIds || []
    });
  }, [initialTasks, initialActiveSessions, initialTodaySessions, initialPomodoroState, initialRecentSubTaskIds, store]);`
);

// 3. Replace Pomodoro State block
const pomodoroRegex = /\/\/ ─── Pomodoro State ───[\s\S]*?const setPomodoroAccumulated = useCallback.*?\}, \[\]\);/g;

code = code.replace(pomodoroRegex, `// ─── Pomodoro State ──────────────────────────────────────────────────────
  const [showSnail, setShowSnail] = useLocalStorage("fs_showSnail", true);
  const [useProTimePicker, setUseProTimePicker] = useLocalStorage("fs_pro_time_picker", false);
  const [activeProTab, setActiveProTab] = useState<TimerMode>("work");

  const pomodoroMode = store.pomodoroState.pomodoroMode;
  const workDuration = store.pomodoroState.workDuration;
  const shortBreakDuration = store.pomodoroState.shortBreakDuration;
  const longBreakDuration = store.pomodoroState.longBreakDuration;
  const sessionsBeforeLongBreak = store.pomodoroState.sessionsBeforeLongBreak;
  const pomodoroPhase = store.pomodoroState.pomodoroPhase;
  const pomodorosCompleted = store.pomodoroState.pomodorosCompleted;
  const breakStartTime = store.pomodoroState.breakStartTime;
  const pomodoroAccumulated = store.pomodoroState.pomodoroAccumulated;

  const updateP = (key, val, prev) => {
    const next = typeof val === 'function' ? val(prev) : val;
    store.updatePomodoroState({ [key]: next });
    store.pushSyncOperation('updateUserPomodoroState', { [key]: next });
    return next;
  };

  const setPomodoroMode = useCallback((val) => updateP('pomodoroMode', val, pomodoroMode), [pomodoroMode, store]);
  const setWorkDuration = useCallback((val) => updateP('workDuration', val, workDuration), [workDuration, store]);
  const setShortBreakDuration = useCallback((val) => updateP('shortBreakDuration', val, shortBreakDuration), [shortBreakDuration, store]);
  const setLongBreakDuration = useCallback((val) => updateP('longBreakDuration', val, longBreakDuration), [longBreakDuration, store]);
  const setSessionsBeforeLongBreak = useCallback((val) => updateP('sessionsBeforeLongBreak', val, sessionsBeforeLongBreak), [sessionsBeforeLongBreak, store]);
  const setPomodoroPhase = useCallback((val) => updateP('pomodoroPhase', val, pomodoroPhase), [pomodoroPhase, store]);
  const setPomodorosCompleted = useCallback((val) => updateP('pomodorosCompleted', val, pomodorosCompleted), [pomodorosCompleted, store]);
  const setBreakStartTime = useCallback((val) => updateP('breakStartTime', val ? new Date(val).toISOString() : null, breakStartTime), [breakStartTime, store]);
  const setPomodoroAccumulated = useCallback((val) => updateP('pomodoroAccumulated', val, pomodoroAccumulated), [pomodoroAccumulated, store]);
`);

// 4. Remove refresh
code = code.replace(
  /const refresh = useCallback\(\(\) => \{ startTransition\(\(\) => \{ router\.refresh\(\); \}\); \}, \[router\]\);/g,
  `const refresh = useCallback(() => { /* local first: do nothing */ }, []);`
);

// 5. Replace API calls inside handlers to push to sync queue!
// E.g. await startSession(subTaskId) -> store.pushSyncOperation('startSession', subTaskId);

// We'll let a SyncProvider handle the actual server calls. 
// But wait, some functions return the newly created task! 
// Like: const newInbox = await createParentTask("Inbox") as FullParentTask;
// If we replace it with `pushSyncOperation`, we can't `await` the real DB ID!
// This is exactly why we need UUIDs on the client! We can generate an ID!
// Wait... The system currently uses MongoDB ObjectIds!
// If we generate a UUID for `inbox.id`, will `actions.ts` accept it?
// Yes! I literally fixed that bug in the previous step. `toMongoId` safely accepts UUIDs!
// Oh my god, that bug fix just perfectly enabled Local-First optimistic creation!

fs.writeFileSync('src/components/flowstate-app.tsx', code);
