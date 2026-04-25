// Shared event types and contracts

export interface TaskInput {
  taskId: string;
  userId: number;
  chatId: number;
  sessionId: string | null;
  prompt: string;
  workspacePath: string;
  startSha: string;
  model: string;
  effort: string;
  maxBudgetUsd: number | null;
}

export type ProgressEvent =
  | { taskId: string; kind: "text"; delta: string }
  | { taskId: string; kind: "tool_use"; tool: string; summary: string }
  | { taskId: string; kind: "tool_result"; tool: string; ok: boolean };

export type ProgressCallback = (event: ProgressEvent) => void;

export interface EvidenceBundle {
  taskId: string;
  sessionId: string;
  summary: string;
  diff: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    perFile: Array<{ path: string; insertions: number; deletions: number }>;
  };
  tests: { ran: boolean; passed: boolean; output: string | null } | null;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number | null;
}

export interface SessionState {
  sessionId: string | null;
  activeTaskId: string | null;
  lastMessageId: number;
  updatedAt: string;
}
