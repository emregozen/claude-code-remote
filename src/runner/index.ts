import type { EvidenceBundle, ProgressCallback, ProgressEvent, TaskInput } from "../types.js";
import type { ToolCall } from "./evidence/collector.js";
import { collectEvidence } from "./evidence/collector.js";
import type { Config } from "../config.js";

export interface Runner {
  runTask(input: TaskInput, onProgress: ProgressCallback): Promise<EvidenceBundle>;
}

export async function createRunner(cfg: Config): Promise<Runner> {
  return {
    async runTask(input: TaskInput, onProgress: ProgressCallback): Promise<EvidenceBundle> {
      console.log(`[task:${input.taskId}] Starting execution`);

      let accumulatedText = "";
      let tokensIn = 0;
      let tokensOut = 0;
      let costUsd: number | null = null;
      const startTime = Date.now();
      const toolCalls: ToolCall[] = [];
      let lastBashCall: ToolCall | null = null;
      const ac = new AbortController();

      const timeoutHandle = setTimeout(() => {
        ac.abort();
      }, cfg.TASK_TIMEOUT_MS);

      try {
        // Dynamic import of @anthropic-ai/claude-code
        // @ts-ignore - SDK types may not be available at compile time
        const { query } = await import("@anthropic-ai/claude-code");

        const iter = query({
          prompt: input.prompt,
          options: {
            cwd: input.workspacePath,
            resume: input.sessionId ?? undefined,
            permissionMode: cfg.CC_SKIP_PERMISSIONS ? "bypassPermissions" : "default",
            abortController: ac,
          },
        });

        let resultSessionId = input.sessionId;

        for await (const msg of iter as AsyncIterable<Record<string, unknown>>) {
          if (msg.type === "assistant") {
            accumulatedText = (msg.text ?? "") as string;
            const progressEvent: ProgressEvent = {
              taskId: input.taskId,
              kind: "text",
              delta: accumulatedText,
            };
            onProgress(progressEvent);
          } else if (msg.type === "tool_use") {
            const tool = (msg.tool ?? "unknown") as string;
            const toolCall: ToolCall = { tool };

            if (tool === "Bash") {
              const toolInput = msg.input as Record<string, unknown> | undefined;
              if (toolInput?.command) {
                toolCall.command = String(toolInput.command);
              }
              lastBashCall = toolCall;
              toolCalls.push(toolCall);
            }

            const progressEvent: ProgressEvent = {
              taskId: input.taskId,
              kind: "tool_use",
              tool,
              summary: (msg.summary ?? "...") as string,
            };
            onProgress(progressEvent);
          } else if (msg.type === "tool_result") {
            const isError = (msg.is_error ?? false) as boolean;
            const output = msg.content as string | undefined;

            if (lastBashCall) {
              lastBashCall.exitCode = isError ? 1 : 0;
              if (output) {
                lastBashCall.output = output;
              }
              lastBashCall = null;
            }

            const progressEvent: ProgressEvent = {
              taskId: input.taskId,
              kind: "tool_result",
              tool: "tool_result",
              ok: !isError,
            };
            onProgress(progressEvent);
          } else if (msg.type === "result") {
            resultSessionId = (msg.session_id as string) ?? input.sessionId;
            tokensIn = (msg.tokens_input ?? 0) as number;
            tokensOut = (msg.tokens_output ?? 0) as number;
            costUsd = (msg.cost_usd ?? null) as number | null;
          }
        }

        clearTimeout(timeoutHandle);

        const durationMs = Date.now() - startTime;

        // Collect evidence
        const evidence = await collectEvidence({
          taskId: input.taskId,
          sessionId: resultSessionId ?? input.sessionId ?? "",
          summary: accumulatedText,
          workspacePath: input.workspacePath,
          startSha: input.startSha,
          toolCalls,
          tokensIn,
          tokensOutput: tokensOut,
          costUsd,
          durationMs,
        });

        return evidence;
      } catch (error) {
        clearTimeout(timeoutHandle);
        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Task execution failed: ${message}`);
      }
    },
  };
}
