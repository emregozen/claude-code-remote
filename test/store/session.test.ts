import { describe, it, expect, beforeEach } from "vitest";
import { SessionStore } from "../../src/store/session.js";

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  describe("session management", () => {
    it("returns null for non-existent session", () => {
      const session = store.getSession(123);
      expect(session).toBeNull();
    });

    it("sets and retrieves a session", () => {
      const sessionData = {
        sessionId: "sess-123",
        activeTaskId: null,
        lastMessageId: null,
        updatedAt: new Date().toISOString(),
        model: "sonnet",
        effort: "medium",
        maxBudgetUsd: null,
      };
      store.setSession(123, sessionData);

      const retrieved = store.getSession(123);
      expect(retrieved).toEqual(sessionData);
    });

    it("updates an existing session", () => {
      const initial = {
        sessionId: "sess-123",
        activeTaskId: null,
        lastMessageId: null,
        updatedAt: new Date().toISOString(),
        model: "sonnet",
        effort: "medium",
        maxBudgetUsd: null,
      };
      store.setSession(123, initial);

      const updated = { ...initial, activeTaskId: "task-456" };
      store.setSession(123, updated);

      const retrieved = store.getSession(123);
      expect(retrieved?.activeTaskId).toBe("task-456");
    });

    it("deletes a session", () => {
      const sessionData = {
        sessionId: "sess-123",
        activeTaskId: null,
        lastMessageId: null,
        updatedAt: new Date().toISOString(),
        model: "sonnet",
        effort: "medium",
        maxBudgetUsd: null,
      };
      store.setSession(123, sessionData);

      store.deleteSession(123);
      const retrieved = store.getSession(123);
      expect(retrieved).toBeNull();
    });
  });

  describe("progress state", () => {
    it("returns undefined for non-existent progress", () => {
      const progress = store.getProgress("task-1");
      expect(progress).toBeDefined(); // lazy init
    });

    it("lazy initializes progress state", () => {
      const progress = store.getProgress("task-1");
      expect(progress).toBeDefined();
      expect(progress.text).toBe("");
      expect(progress.tools).toEqual([]);
    });

    it("deletes progress state", () => {
      store.getProgress("task-1");
      store.deleteProgress("task-1");

      const progress = store.getProgress("task-1");
      expect(progress).toBeDefined(); // re-initializes
      expect(progress.text).toBe("");
    });

    it("isolates progress state per task", () => {
      const p1 = store.getProgress("task-1");
      const p2 = store.getProgress("task-2");

      expect(p1).not.toBe(p2);
    });
  });
});
