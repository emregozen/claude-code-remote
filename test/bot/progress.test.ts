import { describe, it, expect } from "vitest";
import type { ProgressEvent } from "../../src/types.js";

describe("Progress state accumulation", () => {
  // Simple test of the ProgressEvent discriminated union types
  // The actual ProgressUpdater is harder to test without grammY context

  it("text event type is valid", () => {
    const event: ProgressEvent = {
      taskId: "task-1",
      kind: "text",
      delta: "some text",
    };
    expect(event.kind).toBe("text");
    expect(event.delta).toBe("some text");
  });

  it("tool_use event type is valid", () => {
    const event: ProgressEvent = {
      taskId: "task-1",
      kind: "tool_use",
      tool: "Bash",
      summary: "running tests",
    };
    expect(event.kind).toBe("tool_use");
    expect(event.tool).toBe("Bash");
    expect(event.summary).toBe("running tests");
  });

  it("tool_result event type is valid", () => {
    const event: ProgressEvent = {
      taskId: "task-1",
      kind: "tool_result",
      tool: "Bash",
      ok: true,
    };
    expect(event.kind).toBe("tool_result");
    expect(event.ok).toBe(true);
  });

  it("discriminates between event kinds", () => {
    const events: ProgressEvent[] = [
      { taskId: "t1", kind: "text", delta: "hello" },
      { taskId: "t1", kind: "tool_use", tool: "Read", summary: "reading file" },
      { taskId: "t1", kind: "tool_result", tool: "Read", ok: true },
    ];

    expect(events.filter((e) => e.kind === "text")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "tool_use")).toHaveLength(1);
    expect(events.filter((e) => e.kind === "tool_result")).toHaveLength(1);
  });
});
