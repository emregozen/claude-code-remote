import { execa } from "execa";
import type { Config } from "../config.js";
import type { EvidenceBundle, ProgressCallback, ProgressEvent, TaskInput } from "../types.js";
import type { ToolCall } from "./evidence/collector.js";
import { collectEvidence } from "./evidence/collector.js";

export interface Runner {
  runTask(input: TaskInput, onProgress: ProgressCallback): Promise<EvidenceBundle>;
  stopTask(taskId: string): void;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  is_error?: boolean;
}

interface ClaudeMessage {
  type: string;
  message?: {
    content?: ContentBlock[];
  };
  session_id?: string;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export async function createRunner(cfg: Config): Promise<Runner> {
  const activeControllers = new Map<string, AbortController>();
  const activeProcesses = new Map<string, any>();

  return {
    stopTask(taskId: string): void {
      console.log(`[runner:stopTask] Attempting to stop task ${taskId}`);
      const controller = activeControllers.get(taskId);
      const subprocess = activeProcesses.get(taskId);

      console.log(
        `[runner:stopTask] Found subprocess: ${!!subprocess}, controller: ${!!controller}`,
      );

      if (subprocess) {
        try {
          console.log(`[runner:stopTask] Killing subprocess for task ${taskId}`);
          subprocess.kill();
          console.log("[runner:stopTask] Successfully killed subprocess");
        } catch (error) {
          console.log("[runner:stopTask] Error killing subprocess:", error);
        }
      }

      if (controller) {
        console.log(`[runner:stopTask] Aborting controller for task ${taskId}`);
        controller.abort();
      }
    },

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

      activeControllers.set(input.taskId, ac);

      try {
        const args: string[] = ["--print", "--output-format=stream-json", "--verbose"];

        if (input.sessionId) {
          args.push("--resume", input.sessionId);
        }

        args.push("--model", input.model);
        args.push("--effort", input.effort);

        if (input.maxBudgetUsd !== null) {
          args.push("--max-budget-usd", String(input.maxBudgetUsd));
        }

        const permissionMode = cfg.CC_SKIP_PERMISSIONS ? "bypassPermissions" : "default";
        args.push("--permission-mode", permissionMode);

        // Prompt MUST be last argument
        args.push(input.prompt);

        console.log(
          `[task:${input.taskId}] Executing: claude ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
        );

        const subprocess = execa("claude", args, {
          cwd: input.workspacePath,
          cancelSignal: ac.signal,
        });

        activeProcesses.set(input.taskId, subprocess);

        let resultSessionId = input.sessionId;

        if (!subprocess.stdout) {
          throw new Error("Failed to create subprocess stream");
        }

        console.log(`[task:${input.taskId}] Waiting for output from subprocess...`);
        let buffer = "";
        for await (const chunk of subprocess.stdout) {
          console.log(`[task:${input.taskId}] Received chunk: ${chunk.length} bytes`);
          if (ac.signal.aborted) {
            break;
          }

          buffer += chunk;
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) {
              continue;
            }

            let event: ClaudeMessage;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }

            if (event.type === "assistant" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "text" && block.text) {
                  accumulatedText = block.text;
                  const progressEvent: ProgressEvent = {
                    taskId: input.taskId,
                    kind: "text",
                    delta: accumulatedText,
                  };
                  onProgress(progressEvent);
                } else if (block.type === "tool_use" && block.name) {
                  const tool = block.name;
                  const toolCall: ToolCall = { tool };

                  if (tool === "Bash" && block.input?.command) {
                    toolCall.command = String(block.input.command);
                    lastBashCall = toolCall;
                    toolCalls.push(toolCall);
                  }

                  const progressEvent: ProgressEvent = {
                    taskId: input.taskId,
                    kind: "tool_use",
                    tool,
                    summary: "...",
                  };
                  onProgress(progressEvent);
                }
              }
            } else if (event.type === "user" && event.message?.content) {
              for (const block of event.message.content) {
                if (block.type === "tool_result") {
                  const isError = (block.is_error ?? false) as boolean;
                  const output = block.content as string | undefined;

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
                }
              }
            } else if (event.type === "result") {
              resultSessionId = event.session_id ?? input.sessionId;
              tokensIn = event.usage?.input_tokens ?? 0;
              tokensOut = event.usage?.output_tokens ?? 0;
              costUsd = event.total_cost_usd ?? null;
            }
          }
        }

        // Ensure subprocess has fully exited (catches any deferred errors from kill)
        await subprocess;

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

        activeControllers.delete(input.taskId);
        activeProcesses.delete(input.taskId);
        return evidence;
      } catch (error) {
        clearTimeout(timeoutHandle);
        activeControllers.delete(input.taskId);
        activeProcesses.delete(input.taskId);

        // Preserve cancellation errors as-is
        if ((error as any)?.isCanceled) {
          throw error;
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Task execution failed: ${message}`);
      }
    },
  };
}
