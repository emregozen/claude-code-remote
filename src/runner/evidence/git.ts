import { execa } from "execa";

export interface DiffResult {
  filesChanged: number;
  insertions: number;
  deletions: number;
  perFile: Array<{ path: string; insertions: number; deletions: number }>;
}

export async function getGitHead(cwd: string): Promise<string> {
  const { stdout } = await execa("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

export async function getGitDiff(taskStartSha: string, cwd: string): Promise<DiffResult> {
  try {
    const perFile: Array<{ path: string; insertions: number; deletions: number }> = [];

    // Get unstaged changes
    const { stdout: unstaged } = await execa("git", ["diff", "--numstat", taskStartSha], { cwd });

    if (unstaged.trim()) {
      perFile.push(
        ...unstaged
          .trim()
          .split("\n")
          .map((line) => {
            const [ins, del, path] = line.split("\t");
            return {
              path: path ?? "",
              insertions: Number.parseInt(ins ?? "0", 10) || 0,
              deletions: Number.parseInt(del ?? "0", 10) || 0,
            };
          }),
      );
    }

    // Get staged changes
    const { stdout: staged } = await execa("git", ["diff", "--cached", "--numstat", taskStartSha], {
      cwd,
    });

    if (staged.trim()) {
      const stagedFiles = staged
        .trim()
        .split("\n")
        .map((line) => {
          const [ins, del, path] = line.split("\t");
          return {
            path: path ?? "",
            insertions: Number.parseInt(ins ?? "0", 10) || 0,
            deletions: Number.parseInt(del ?? "0", 10) || 0,
          };
        });

      // Merge staged into perFile, summing duplicates
      for (const stagedFile of stagedFiles) {
        const existing = perFile.find((f) => f.path === stagedFile.path);
        if (existing) {
          existing.insertions += stagedFile.insertions;
          existing.deletions += stagedFile.deletions;
        } else {
          perFile.push(stagedFile);
        }
      }
    }

    if (perFile.length === 0) {
      return { filesChanged: 0, insertions: 0, deletions: 0, perFile: [] };
    }

    const insertions = perFile.reduce((s, f) => s + f.insertions, 0);
    const deletions = perFile.reduce((s, f) => s + f.deletions, 0);

    return {
      filesChanged: perFile.length,
      insertions,
      deletions,
      perFile,
    };
  } catch (err) {
    console.error(`[getGitDiff] Failed to get diff from ${taskStartSha}:`, err);
    return { filesChanged: 0, insertions: 0, deletions: 0, perFile: [] };
  }
}
