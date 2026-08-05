-- CreateTable
CREATE TABLE "ParentTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "general_notes" TEXT,
    "total_cumulative_time" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SubTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parent_task_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_cumulative_time" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubTask_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "ParentTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sub_task_id" TEXT NOT NULL,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME,
    "duration" INTEGER NOT NULL DEFAULT 0,
    "session_notes" TEXT,
    CONSTRAINT "Session_sub_task_id_fkey" FOREIGN KEY ("sub_task_id") REFERENCES "SubTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
