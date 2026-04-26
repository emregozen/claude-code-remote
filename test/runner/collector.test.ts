import { describe, it, expect, vi, beforeEach } from "vitest";
import { collectEvidence } from "../../src/runner/evidence/collector.js";
import * as gitModule from "../../src/runner/evidence/git.js";

// Mock git module
vi.mock("../../src/runner/evidence/git.js");

describe("collectEvidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an EvidenceBundle with correct structure", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 1,
      insertions: 10,
      deletions: 5,
      perFile: [{ path: "src/app.ts", insertions: 10, deletions: 5 }],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Made some changes",
      tokensIn: 1000,
      tokensOutput: 500,
      costUsd: 0.01,
      durationMs: 5000,
      toolCalls: [],
    });

    expect(evidence.taskId).toBe("task-1");
    expect(evidence.summary).toBe("Made some changes");
    expect(evidence.diff.filesChanged).toBe(1);
    expect(evidence.tests).toBeNull();
  });

  it("detects npm test command", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Task done",
      tokensIn: 1000,
      tokensOutput: 500,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [
        { tool: "Bash", command: "npm test", exitCode: 0, output: "All tests passed" },
      ],
    });

    expect(evidence.tests).toBeDefined();
    expect(evidence.tests?.ran).toBe(true);
  });

  it("determines test pass/fail from exit code", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Done",
      tokensIn: 100,
      tokensOutput: 50,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [{ tool: "Bash", command: "npm test", exitCode: 1, output: "Test failed" }],
    });

    expect(evidence.tests?.passed).toBe(false);
  });

  it("uses last test command when multiple ran", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Done",
      tokensIn: 100,
      tokensOutput: 50,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [
        { tool: "Bash", command: "npm test", exitCode: 0, output: "First run passed" },
        { tool: "Bash", command: "npm test", exitCode: 1, output: "Second run failed" },
      ],
    });

    expect(evidence.tests?.output).toContain("Second run failed");
    expect(evidence.tests?.passed).toBe(false);
  });

  it("returns null tests when no test command ran", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Done",
      tokensIn: 100,
      tokensOutput: 50,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [{ tool: "Bash", command: "echo hello", exitCode: 0, output: "hello" }],
    });

    expect(evidence.tests).toBeNull();
  });

  it("truncates summary to 1500 chars", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
      perFile: [],
    });

    const longSummary = "x".repeat(2000);
    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: longSummary,
      tokensIn: 100,
      tokensOutput: 50,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [],
    });

    expect(evidence.summary.length).toBeLessThanOrEqual(1500);
  });

  it("uses fallback summary when text is empty", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 1,
      insertions: 10,
      deletions: 5,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "",
      tokensIn: 100,
      tokensOutput: 50,
      costUsd: null,
      durationMs: 5000,
      toolCalls: [],
    });

    expect(evidence.summary).toContain("completed");
  });

  it("preserves all bundle fields", async () => {
    const mockGetGitDiff = vi.mocked(gitModule.getGitDiff);
    mockGetGitDiff.mockResolvedValueOnce({
      filesChanged: 2,
      insertions: 20,
      deletions: 10,
      perFile: [],
    });

    const evidence = await collectEvidence({
      taskId: "task-1",
      sessionId: "sess-1",
      startSha: "abc123",
      workspacePath: "/workspace",
      summary: "Summary",
      tokensIn: 1234,
      tokensOutput: 567,
      costUsd: 0.05,
      durationMs: 12345,
      toolCalls: [],
    });

    expect(evidence.tokensInput).toBe(1234);
    expect(evidence.tokensOutput).toBe(567);
    expect(evidence.costUsd).toBe(0.05);
    expect(evidence.durationMs).toBe(12345);
  });
});
