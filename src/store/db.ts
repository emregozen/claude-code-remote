import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import type { EvidenceBundle } from "../types.js";

export interface TaskRecord {
  id: string;
  user_id: number;
  chat_id: number;
  session_id: string;
  prompt: string;
  status: "running" | "complete" | "error" | "timeout";
  evidence_json: string | null;
  error_json: string | null;
  started_at: string;
  finished_at: string | null;
}

export class SQLiteStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        chat_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL
          CHECK(status IN ('running','complete','error','timeout')),
        evidence_json TEXT,
        error_json TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, started_at DESC);
    `);
  }

  insertTask(task: Omit<TaskRecord, "finished_at" | "evidence_json" | "error_json">): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, user_id, chat_id, session_id, prompt, status, evidence_json, error_json, started_at, finished_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      task.id,
      task.user_id,
      task.chat_id,
      task.session_id,
      task.prompt,
      task.status,
      null,
      null,
      task.started_at,
      null,
    );
  }

  updateTaskStatus(
    taskId: string,
    status: "complete" | "error" | "timeout",
    evidence?: EvidenceBundle,
  ): void {
    const finishedAt = new Date().toISOString();

    if (status === "complete" && evidence) {
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET status = 'complete', evidence_json = ?, finished_at = ?
        WHERE id = ?
      `);
      stmt.run(JSON.stringify(evidence), finishedAt, taskId);
    } else {
      const errorJson = JSON.stringify({
        taskId,
        kind: status === "timeout" ? "timeout" : "internal",
        message: status === "timeout" ? "Task timed out" : "Task failed",
      });
      const stmt = this.db.prepare(`
        UPDATE tasks
        SET status = ?, error_json = ?, finished_at = ?
        WHERE id = ?
      `);
      stmt.run(status, errorJson, finishedAt, taskId);
    }
  }

  markInFlightAsError(): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = 'error', error_json = ?, finished_at = ?
      WHERE status = 'running'
    `);
    stmt.run(
      JSON.stringify({
        taskId: "unknown",
        kind: "internal",
        message: "bot restart",
      }),
      now,
    );
  }

  close(): void {
    this.db.close();
  }
}
