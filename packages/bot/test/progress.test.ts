import type { ProgressEvent } from "@claude-remote/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProgressUpdater } from "../src/progress.js";

describe("ProgressUpdater", () => {
  const mockCtx = {
    api: {
      editMessageText: vi.fn().mockResolvedValue({}),
    },
    chatId: 123,
  };

  const mockProgress = {
    text: "",
    tools: [],
    lastFlushAt: Date.now(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initializes with task id and message id", () => {
    const updater = new ProgressUpdater(mockCtx as any, 456, mockProgress as any, 3000);
    expect(updater).toBeDefined();
  });

  it("throttles progress updates", async () => {
    mockCtx.api.editMessageText.mockResolvedValue({});
    const updater = new ProgressUpdater(mockCtx as any, 456, mockProgress as any, 3000);

    const event: ProgressEvent = {
      taskId: "task-1",
      kind: "text",
      delta: "working...",
    };

    updater.onProgressEvent(event);
    updater.onProgressEvent(event);

    vi.advanceTimersByTime(100);

    expect(mockCtx.api.editMessageText).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);

    expect(mockCtx.api.editMessageText).toHaveBeenCalled();
  });

  it("handles tool use events", async () => {
    const updater = new ProgressUpdater(mockCtx as any, 456, mockProgress as any, 3000);

    const event: ProgressEvent = {
      taskId: "task-1",
      kind: "tool_use",
      tool: "Bash",
      summary: "running command",
    };

    updater.onProgressEvent(event);
    vi.advanceTimersByTime(3100);

    expect(mockCtx.api.editMessageText).toHaveBeenCalled();
  });

  it("cleans up on completion", async () => {
    const updater = new ProgressUpdater(mockCtx as any, 456, mockProgress as any, 3000);

    await updater.cleanup();

    expect(mockCtx.api.editMessageText).not.toThrow();
  });
});
