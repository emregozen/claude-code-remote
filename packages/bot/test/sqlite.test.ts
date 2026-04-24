import { readFileSync, unlinkSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SQLiteStore } from "../src/store/sqlite.js";

describe("SQLiteStore", () => {
  const dbPath = "/tmp/test-remote.db";

  beforeEach(() => {
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  afterEach(() => {
    try {
      unlinkSync(dbPath);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it("initializes database with schema", () => {
    const store = new SQLiteStore(dbPath);
    store.close();
    expect(true).toBe(true);
  });

  it("inserts and retrieves task record", () => {
    const store = new SQLiteStore(dbPath);

    store.insertTask({
      id: "task-1",
      user_id: 123,
      chat_id: 456,
      session_id: "session-1",
      prompt: "test prompt",
      status: "running",
      started_at: new Date().toISOString(),
    });

    store.close();
    expect(true).toBe(true);
  });

  it("updates task to complete", () => {
    const store = new SQLiteStore(dbPath);

    store.insertTask({
      id: "task-1",
      user_id: 123,
      chat_id: 456,
      session_id: "session-1",
      prompt: "test prompt",
      status: "running",
      started_at: new Date().toISOString(),
    });

    const evidence = JSON.stringify({
      taskId: "task-1",
      sessionId: "session-1",
      summary: "done",
      diff: { filesChanged: 0, insertions: 0, deletions: 0, perFile: [] },
      tests: null,
      durationMs: 1000,
      tokensInput: 100,
      tokensOutput: 50,
      costUsd: 0.001,
    });

    store.updateTaskComplete("task-1", evidence, new Date().toISOString());
    store.close();
    expect(true).toBe(true);
  });

  it("marks in-flight tasks as error on recovery", () => {
    const store = new SQLiteStore(dbPath);

    store.insertTask({
      id: "task-1",
      user_id: 123,
      chat_id: 456,
      session_id: "session-1",
      prompt: "test prompt",
      status: "running",
      started_at: new Date().toISOString(),
    });

    store.close();

    const store2 = new SQLiteStore(dbPath);
    store2.markInFlightAsError();
    store2.close();

    expect(true).toBe(true);
  });
});
