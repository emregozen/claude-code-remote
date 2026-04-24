import type { ProgressEvent, TaskCompleteEvent } from "@claude-remote/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RedisStore } from "../src/store/redis.js";

describe("RedisStore", () => {
  const mockRedis = {
    duplicate: vi.fn(),
    publish: vi.fn(),
    hset: vi.fn(),
    hgetall: vi.fn(),
    del: vi.fn(),
  };

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("publishes task new events", async () => {
    mockRedis.publish.mockResolvedValue(1);
    const store = new RedisStore(mockRedis as any);

    await store.publishTaskNew({
      taskId: "task-1",
      userId: 123,
      chatId: 456,
      sessionId: "session-1",
      prompt: "test prompt",
      createdAt: new Date().toISOString(),
    });

    expect(mockRedis.publish).toHaveBeenCalled();
    const call = mockRedis.publish.mock.calls[0];
    expect(call[0]).toContain("task:new");
  });

  it("sets session data", async () => {
    mockRedis.hset.mockResolvedValue(1);
    const store = new RedisStore(mockRedis as any);

    await store.setSession(123, { sessionId: "session-1" });

    expect(mockRedis.hset).toHaveBeenCalledWith("cr:session:123", {
      sessionId: "session-1",
    });
  });

  it("gets session data", async () => {
    mockRedis.hgetall.mockResolvedValue({ sessionId: "session-1" });
    const store = new RedisStore(mockRedis as any);

    const session = await store.getSession(123);

    expect(session).toEqual({ sessionId: "session-1" });
    expect(mockRedis.hgetall).toHaveBeenCalledWith("cr:session:123");
  });

  it("returns null when session does not exist", async () => {
    mockRedis.hgetall.mockResolvedValue({});
    const store = new RedisStore(mockRedis as any);

    const session = await store.getSession(999);

    expect(session).toBeNull();
  });

  it("deletes session data", async () => {
    mockRedis.del.mockResolvedValue(1);
    const store = new RedisStore(mockRedis as any);

    await store.deleteSession(123);

    expect(mockRedis.del).toHaveBeenCalledWith("cr:session:123");
  });

  it("subscribes to progress events", async () => {
    const mockSub = {
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(1),
    };
    mockRedis.duplicate.mockReturnValue(mockSub);

    const store = new RedisStore(mockRedis as any);
    const callback = vi.fn();

    await store.subscribeToProgress("task-1", callback);

    expect(mockRedis.duplicate).toHaveBeenCalled();
    expect(mockSub.subscribe).toHaveBeenCalled();
  });

  it("subscribes to task complete events", async () => {
    const mockSub = {
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(1),
    };
    mockRedis.duplicate.mockReturnValue(mockSub);

    const store = new RedisStore(mockRedis as any);
    const callback = vi.fn();

    await store.subscribeToTaskComplete("task-1", callback);

    expect(mockSub.subscribe).toHaveBeenCalled();
  });

  it("subscribes to task error events", async () => {
    const mockSub = {
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(1),
    };
    mockRedis.duplicate.mockReturnValue(mockSub);

    const store = new RedisStore(mockRedis as any);
    const callback = vi.fn();

    await store.subscribeToTaskError("task-1", callback);

    expect(mockSub.subscribe).toHaveBeenCalled();
  });
});
