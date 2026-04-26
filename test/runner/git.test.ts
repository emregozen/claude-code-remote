import { describe, it, expect, vi, beforeEach } from "vitest";
import * as module from "execa";
import { getGitDiff, getGitHead } from "../../src/runner/evidence/git.js";

// Mock execa
vi.mock("execa");

describe("Git utilities", () => {
  describe("getGitHead", () => {
    it("returns trimmed git HEAD SHA", async () => {
      const mockExeca = vi.mocked(module.execa);
      mockExeca.mockResolvedValueOnce({
        stdout: "abc123def456\n",
        stderr: "",
        exitCode: 0,
      } as any);

      const result = await getGitHead("/some/path");
      expect(result).toBe("abc123def456");
      expect(mockExeca).toHaveBeenCalledWith("git", ["rev-parse", "HEAD"], { cwd: "/some/path" });
    });

    it("handles git error gracefully", async () => {
      const mockExeca = vi.mocked(module.execa);
      mockExeca.mockRejectedValueOnce(new Error("git not found"));

      await expect(getGitHead("/some/path")).rejects.toThrow();
    });
  });

  describe("getGitDiff", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("parses numstat output into perFile array", async () => {
      const mockExeca = vi.mocked(module.execa);

      // Mock unstaged changes
      mockExeca.mockResolvedValueOnce({
        stdout: "10\t5\tsrc/app.ts\n2\t1\ttest.ts\n",
        stderr: "",
        exitCode: 0,
      } as any);

      // Mock staged changes (empty)
      mockExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as any);

      const result = await getGitDiff("abc123", "/some/path");

      expect(result.filesChanged).toBe(2);
      expect(result.insertions).toBe(12);
      expect(result.deletions).toBe(6);
      expect(result.perFile).toHaveLength(2);
      expect(result.perFile[0]).toEqual({ path: "src/app.ts", insertions: 10, deletions: 5 });
    });

    it("merges staged and unstaged changes for same file", async () => {
      const mockExeca = vi.mocked(module.execa);

      // Mock unstaged
      mockExeca.mockResolvedValueOnce({
        stdout: "10\t5\tsrc/app.ts\n",
        stderr: "",
        exitCode: 0,
      } as any);

      // Mock staged (same file)
      mockExeca.mockResolvedValueOnce({
        stdout: "3\t1\tsrc/app.ts\n",
        stderr: "",
        exitCode: 0,
      } as any);

      const result = await getGitDiff("abc123", "/some/path");

      expect(result.filesChanged).toBe(1);
      expect(result.insertions).toBe(13);
      expect(result.deletions).toBe(6);
      expect(result.perFile[0]).toEqual({ path: "src/app.ts", insertions: 13, deletions: 6 });
    });

    it("returns zero diff when no changes", async () => {
      const mockExeca = vi.mocked(module.execa);

      mockExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as any);

      mockExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as any);

      const result = await getGitDiff("abc123", "/some/path");

      expect(result.filesChanged).toBe(0);
      expect(result.insertions).toBe(0);
      expect(result.deletions).toBe(0);
      expect(result.perFile).toHaveLength(0);
    });

    it("returns zero diff on git error", async () => {
      const mockExeca = vi.mocked(module.execa);

      mockExeca.mockRejectedValueOnce(new Error("git command failed"));

      const result = await getGitDiff("abc123", "/some/path");

      expect(result.filesChanged).toBe(0);
      expect(result.insertions).toBe(0);
      expect(result.deletions).toBe(0);
    });

    it("splits on tabs correctly", async () => {
      const mockExeca = vi.mocked(module.execa);

      mockExeca.mockResolvedValueOnce({
        stdout: "5\t2\tsrc/app.ts\n3\t1\ttest.ts\n",
        stderr: "",
        exitCode: 0,
      } as any);

      mockExeca.mockResolvedValueOnce({
        stdout: "",
        stderr: "",
        exitCode: 0,
      } as any);

      const result = await getGitDiff("abc123", "/some/path");

      expect(result.perFile).toHaveLength(2);
      expect(result.perFile[0].path).toBe("src/app.ts");
      expect(result.perFile[1].path).toBe("test.ts");
    });
  });
});
