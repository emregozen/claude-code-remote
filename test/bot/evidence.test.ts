import { describe, it, expect } from "vitest";
import { renderEvidence } from "../../src/bot/evidence.js";
import type { EvidenceBundle } from "../../src/types.js";

describe("renderEvidence", () => {
  const baseEvidence: EvidenceBundle = {
    taskId: "task-123",
    sessionId: "session-456",
    summary: "Made some changes to the codebase",
    diff: {
      filesChanged: 2,
      insertions: 10,
      deletions: 5,
      perFile: [
        { path: "src/app.ts", insertions: 8, deletions: 3 },
        { path: "test/app.test.ts", insertions: 2, deletions: 2 },
      ],
    },
    tests: { ran: true, passed: true, output: "All tests passed" },
    durationMs: 5000,
    tokensInput: 1000,
    tokensOutput: 500,
    costUsd: 0.01,
  };

  it("returns a string", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    expect(typeof result).toBe("string");
  });

  it("includes task done header", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    expect(result).toContain("✅");
    expect(result).toContain("Task done");
  });

  it("includes file diff entries", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    // Files are escaped in markdown V2: . becomes \.
    expect(result).toContain("src/app");
    expect(result).toContain("test");
  });

  it("includes summary", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    expect(result).toContain("Made some changes to the codebase");
  });

  it("shows tests passed when passed is true", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    expect(result).toContain("✅");
    expect(result).toContain("passed");
  });

  it("shows tests failed when passed is false", () => {
    const evidence = {
      ...baseEvidence,
      tests: { ran: true, passed: false, output: "Test failed" },
    };
    const result = renderEvidence(evidence, "Test prompt");
    expect(result).toContain("❌");
    expect(result).toContain("failed");
  });

  it("omits tests line when tests is null", () => {
    const evidence = { ...baseEvidence, tests: null };
    const result = renderEvidence(evidence, "Test prompt");
    // Should not have a tests line at all
    expect(result).not.toMatch(/\*Tests\*:/);
  });

  it("respects 4000 char limit", () => {
    const longSummary = "x".repeat(5000);
    const evidence = { ...baseEvidence, summary: longSummary };
    const result = renderEvidence(evidence, "Test prompt");
    expect(result.length).toBeLessThanOrEqual(4000);
  });

  it("truncates prompt to first 200 chars", () => {
    const longPrompt = "a".repeat(300);
    const result = renderEvidence(baseEvidence, longPrompt);
    expect(result).toContain("aaa");
  });

  it("includes duration and cost footer", () => {
    const result = renderEvidence(baseEvidence, "Test prompt");
    expect(result).toMatch(/\d+s/); // duration
    expect(result).toMatch(/\$/); // cost symbol
  });

  it("handles zero cost", () => {
    const evidence = { ...baseEvidence, costUsd: null };
    const result = renderEvidence(evidence, "Test prompt");
    expect(result).toMatch(/\d+\/\d+\s+tok/); // token counts
  });

  it("handles more than 10 files", () => {
    const perFile = Array.from({ length: 15 }, (_, i) => ({
      path: `file${i}.ts`,
      insertions: i,
      deletions: i,
    }));
    const evidence = { ...baseEvidence, diff: { ...baseEvidence.diff, filesChanged: 15, perFile } };
    const result = renderEvidence(evidence, "Test prompt");
    // The "+" is escaped in MarkdownV2
    expect(result).toContain("more");
    expect(result).toMatch(/\\\+\d+ more/);
  });
});
