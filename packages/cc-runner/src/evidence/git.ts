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
    const { stdout: numstatOut } = await execa(
      "git",
      ["diff", "--numstat", `${taskStartSha}..HEAD`],
      { cwd },
    );

    if (!numstatOut.trim()) {
      return { filesChanged: 0, insertions: 0, deletions: 0, perFile: [] };
    }

    const perFile = numstatOut
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

    const insertions = perFile.reduce((s, f) => s + f.insertions, 0);
    const deletions = perFile.reduce((s, f) => s + f.deletions, 0);

    return {
      filesChanged: perFile.length,
      insertions,
      deletions,
      perFile,
    };
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0, perFile: [] };
  }
}
