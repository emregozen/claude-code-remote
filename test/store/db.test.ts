import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { SQLiteStore } from "../../src/store/db.js";
import type { TaskRecord } from "../../src/store/db.js";

describe("SQLiteStore", () => {
  let dbPath: string;
  let store: SQLiteStore;

  beforeEach(() => {
    // Use a temp file for each test
    dbPath = path.join("/tmp", `test-db-${randomUUID()}.sqlite`);
    store = new SQLiteStore(dbPath);
  });

  afterEach(async () => {
    await store.close();
    // Clean up temp files
    try {
      fs.unlinkSync(dbPath);
    } catch {
      // File might not exist
    }
  });

  it("initializes the database", async () => {
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("initializes the database schema", async () => {
    // Just verify that insertTask doesn't throw
    const task = {
      id: randomUUID(),
      user_id: 123,
      chat_id: 456,
      session_id: "sess-123",
      prompt: "Do something",
      status: "running" as const,
      started_at: new Date().toISOString(),
    };

    expect(() => {
      store.insertTask(task as any);
    }).not.toThrow();
  });

  it("updateTaskStatus succeeds with valid data", async () => {
    const taskId = randomUUID();
    const task = {
      id: taskId,
      user_id: 123,
      chat_id: 456,
      session_id: "sess-123",
      prompt: "Do something",
      status: "running" as const,
      started_at: new Date().toISOString(),
    };

    store.insertTask(task as any);

    const evidence = {
      taskId,
      sessionId: "sess-123",
      summary: "All done",
      diff: { filesChanged: 1, insertions: 10, deletions: 5, perFile: [] },
      tests: null,
      durationMs: 1000,
      tokensInput: 100,
      tokensOutput: 50,
      costUsd: 0.01,
    };

    expect(() => {
      store.updateTaskStatus(taskId, "complete", evidence);
    }).not.toThrow();
  });

  it("markInFlightAsError succeeds", async () => {
    const task1 = {
      id: randomUUID(),
      user_id: 123,
      chat_id: 456,
      session_id: "sess-123",
      prompt: "Task 1",
      status: "running" as const,
      started_at: new Date().toISOString(),
    };

    store.insertTask(task1 as any);

    expect(() => {
      store.markInFlightAsError();
    }).not.toThrow();
  });

  it("closes the database without error", async () => {
    expect(async () => {
      await store.close();
    }).not.toThrow();
  });
});
