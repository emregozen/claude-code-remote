import type { EvidenceBundle } from "@claude-remote/shared";
import { describe, expect, it } from "vitest";
import { renderEvidence } from "../src/evidence.js";

describe("renderEvidence", () => {
  const baseEvidence: EvidenceBundle = {
    taskId: "task-1",
    sessionId: "session-1",
    summary: "Updated README.md with new section",
    diff: {
      filesChanged: 1,
      insertions: 10,
      deletions: 2,
      perFile: [{ path: "README.md", insertions: 10, deletions: 2 }],
    },
    tests: null,
    durationMs: 5000,
    tokensInput: 100,
    tokensOutput: 50,
    costUsd: 0.001,
  };

  it("renders evidence with changes and no tests", () => {
    const result = renderEvidence(baseEvidence, "update readme");
    expect(result).toContain("Updated");
    expect(result).toContain("with new section");
    expect(result).toContain("*Task done*");
    expect(result).toContain("README");
  });

  it("renders evidence with passing tests", () => {
    const evidenceWithTests: EvidenceBundle = {
      ...baseEvidence,
      tests: { ran: true, passed: true, output: "2 tests passed" },
    };
    const result = renderEvidence(evidenceWithTests, "add tests");
    expect(result).toContain("✅ passed");
  });

  it("renders evidence with failing tests", () => {
    const evidenceWithTests: EvidenceBundle = {
      ...baseEvidence,
      tests: { ran: true, passed: false, output: "1 test failed" },
    };
    const result = renderEvidence(evidenceWithTests, "fix tests");
    expect(result).toContain("❌ failed");
  });

  it("escapes markdown special characters in summary", () => {
    const evidenceWithSpecialChars: EvidenceBundle = {
      ...baseEvidence,
      summary: "Updated [file](path) with _special_ chars",
    };
    const result = renderEvidence(evidenceWithSpecialChars, "update");
    expect(result).toContain("\\[");
    expect(result).toContain("\\]");
  });

  it("handles empty changes gracefully", () => {
    const evidenceNoChanges: EvidenceBundle = {
      ...baseEvidence,
      diff: {
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
        perFile: [],
      },
    };
    const result = renderEvidence(evidenceNoChanges, "read files");
    expect(result).toContain("*Task done*");
    expect(result).toContain("no files changed");
  });

  it("truncates long summary to 1500 chars", () => {
    const longSummary = "x".repeat(2000);
    const evidenceLong: EvidenceBundle = {
      ...baseEvidence,
      summary: longSummary,
    };
    const result = renderEvidence(evidenceLong, "long task");
    expect(result.length).toBeLessThan(4100);
  });

  it("shows cost information", () => {
    const result = renderEvidence(baseEvidence, "update readme");
    expect(result).toContain("💰");
    expect(result).toContain("0.0010");
  });

  it("handles multiple files in diff", () => {
    const multiFileEvidence: EvidenceBundle = {
      ...baseEvidence,
      diff: {
        filesChanged: 2,
        insertions: 15,
        deletions: 5,
        perFile: [
          { path: "src/index.ts", insertions: 10, deletions: 3 },
          { path: "README.md", insertions: 5, deletions: 2 },
        ],
      },
    };
    const result = renderEvidence(multiFileEvidence, "refactor");
    expect(result).toContain("index");
    expect(result).toContain("README");
  });
});
