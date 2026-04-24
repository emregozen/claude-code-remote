import type { EvidenceBundle } from "@claude-remote/shared";

import { getGitDiff } from "./git.js";

const TEST_PATTERNS = [
  /^npm\s+test/,
  /^npm\s+run\s+test/,
  /^pnpm\s+test/,
  /^yarn\s+test/,
  /^pytest/,
  /^python\s+-m\s+pytest/,
  /^go\s+test\s/,
  /^cargo\s+test/,
  /^mvn\s+test/,
  /^gradle\s+test/,
];

export interface ToolCall {
  tool: string;
  command?: string;
  exitCode?: number;
  output?: string;
}

function isTestCommand(command: string): boolean {
  return TEST_PATTERNS.some((p) => p.test(command.trim()));
}

export async function collectEvidence(options: {
  taskId: string;
  sessionId: string;
  taskStartSha: string;
  lastAssistantText: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  durationMs: number;
  workspacePath: string;
  toolCalls: ToolCall[];
}): Promise<EvidenceBundle> {
  const diff = await getGitDiff(options.taskStartSha, options.workspacePath);

  const summary = options.lastAssistantText.slice(-1500) || "Task completed. See diff for changes.";

  let tests: EvidenceBundle["tests"] = null;
  const lastTestCall = [...options.toolCalls]
    .reverse()
    .find((tc) => tc.tool === "Bash" && tc.command && isTestCommand(tc.command));

  if (lastTestCall) {
    const output = lastTestCall.output
      ? lastTestCall.output.split("\n").slice(-40).join("\n")
      : null;
    tests = {
      ran: true,
      passed: lastTestCall.exitCode === 0,
      output,
    };
  }

  return {
    taskId: options.taskId,
    sessionId: options.sessionId,
    summary,
    diff,
    tests,
    durationMs: options.durationMs,
    tokensInput: options.tokensIn,
    tokensOutput: options.tokensOut,
    costUsd: options.costUsd,
  };
}
