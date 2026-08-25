"use client";

import { useEffect, useRef } from "react";
import { useFlowStore } from "@/store/useFlowStore";
import { 
  createParentTask, createSubTask, renameParentTask, renameSubTask,
  deleteParentTask, deleteSubTask, deleteSession, startSession,
  stopSession, pauseSession, resumeSession, createChecklistItem,
  toggleChecklistItem, deleteChecklistItem, updateUserPomodoroState,
  updateParentTaskNotes, updateSessionNotes
} from "@/lib/actions";
import { toast } from "sonner";

export default function SyncProvider({ children }: { children: React.ReactNode }) {
  const store = useFlowStore();
  const isSyncing = useRef(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      const queue = useFlowStore.getState().syncQueue;
      if (queue.length === 0 || isSyncing.current) return;

      isSyncing.current = true;
      const batchIds = queue.map(q => q.id);

      try {
        for (const op of queue) {
          try {
            switch (op.action) {
              case 'createParentTask':
                await createParentTask(op.payload.name, op.payload.id);
                break;
              case 'createSubTask':
                await createSubTask(op.payload.parentId, op.payload.name, op.payload.id);
                break;
              case 'renameParentTask':
                await renameParentTask(op.payload.id, op.payload.name);
                break;
              case 'renameSubTask':
                await renameSubTask(op.payload.id, op.payload.name);
                break;
              case 'deleteParentTask':
                await deleteParentTask(op.payload);
                break;
              case 'deleteSubTask':
                await deleteSubTask(op.payload);
                break;
              case 'startSession':
                await startSession(op.payload.subTaskId, op.payload.sessionId);
                break;
              case 'stopSession':
                await stopSession(op.payload);
                break;
              case 'pauseSession':
                await pauseSession(op.payload);
                break;
              case 'resumeSession':
                await resumeSession(op.payload);
                break;
              case 'updateUserPomodoroState':
                await updateUserPomodoroState(op.payload);
                break;
              // ... Add more as needed
            }
          } catch (err) {
            console.error("Failed to sync operation:", op, err);
            // We could optionally break here and leave it in the queue to retry
            // But for simple local-first, we just continue or alert the user.
          }
        }
        
        // Remove successfully processed operations
        useFlowStore.getState().removeSyncOperations(batchIds);
      } finally {
        isSyncing.current = false;
      }
    }, 5000); // 5 second debounce/batching

    return () => clearInterval(interval);
  }, []);

  return <>{children}</>;
}
