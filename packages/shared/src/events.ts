export interface TaskNewEvent {
  taskId: string;
  userId: number;
  chatId: number;
  sessionId: string | null;
  prompt: string;
  createdAt: string;
}

export type ProgressEvent =
  | { taskId: string; kind: "text"; delta: string }
  | { taskId: string; kind: "tool_use"; tool: string; summary: string }
  | { taskId: string; kind: "tool_result"; tool: string; ok: boolean };

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

export interface TaskCompleteEvent {
  evidence: EvidenceBundle;
}

export interface TaskErrorEvent {
  taskId: string;
  kind: "timeout" | "cc_crash" | "internal";
  message: string;
  stack?: string;
}
