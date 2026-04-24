import type { RedisClient } from "@claude-remote/shared";
import { CHANNELS } from "@claude-remote/shared";
import type { ProgressEvent, TaskCompleteEvent, TaskNewEvent } from "@claude-remote/shared";

import { type ToolCall, collectEvidence } from "./evidence/collector.js";
import { getGitHead } from "./evidence/git.js";

export class CCRunner {
  constructor(
    private redis: RedisClient,
    private workspacePath: string,
    private taskTimeoutMs = 1800000,
  ) {}

  async executeTask(event: TaskNewEvent): Promise<void> {
    console.log(`[task:${event.taskId}] Starting execution`);

    let accumulatedText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    const startTime = Date.now();
    let taskStartSha = "";
    const toolCalls: ToolCall[] = [];
    let lastBashCall: ToolCall | null = null;
    const ac = new AbortController();

    const timeoutHandle = setTimeout(() => {
      ac.abort();
    }, this.taskTimeoutMs);

    try {
      taskStartSha = await getGitHead(this.workspacePath);

      // Dynamic import of @anthropic-ai/claude-code
      // @ts-ignore - SDK types may not be available at compile time
      const { query } = await import("@anthropic-ai/claude-code");

      const iter = query({
        prompt: event.prompt,
        options: {
          cwd: "/workspace",
          resume: event.sessionId ?? undefined,
          permissionMode: "bypassPermissions",
          abortController: ac,
        },
      });

      for await (const msg of iter as AsyncIterable<Record<string, unknown>>) {
        if (msg.type === "assistant") {
          accumulatedText = (msg.text ?? "") as string;
          const progressEvent: ProgressEvent = {
            taskId: event.taskId,
            kind: "text",
            delta: accumulatedText,
          };
          await this.redis.publish(
            CHANNELS.TASK_PROGRESS(event.taskId),
            JSON.stringify(progressEvent),
          );
        } else if (msg.type === "tool_use") {
          const tool = (msg.tool ?? "unknown") as string;
          const toolCall: ToolCall = { tool };

          if (tool === "Bash") {
            const input = msg.input as Record<string, unknown> | undefined;
            if (input?.command) {
              toolCall.command = String(input.command);
            }
            lastBashCall = toolCall;
            toolCalls.push(toolCall);
          }

          const progressEvent: ProgressEvent = {
            taskId: event.taskId,
            kind: "tool_use",
            tool,
            summary: (msg.summary ?? "...") as string,
          };
          await this.redis.publish(
            CHANNELS.TASK_PROGRESS(event.taskId),
            JSON.stringify(progressEvent),
          );
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
        } else if (msg.type === "result") {
          const sessionId = msg.session_id;
          tokensIn = (msg.tokens_input ?? 0) as number;
          tokensOut = (msg.tokens_output ?? 0) as number;

          const durationMs = Date.now() - startTime;

          const evidence = await collectEvidence({
            taskId: event.taskId,
            sessionId: String(sessionId ?? event.sessionId),
            taskStartSha,
            lastAssistantText: accumulatedText,
            tokensIn,
            tokensOut,
            costUsd: null,
            durationMs,
            workspacePath: this.workspacePath,
            toolCalls,
          });

          const completeEvent: TaskCompleteEvent = { evidence };

          await this.redis.publish(
            CHANNELS.TASK_COMPLETE(event.taskId),
            JSON.stringify(completeEvent),
          );
          console.log(`[task:${event.taskId}] Completed in ${durationMs}ms`);
        }
      }
    } catch (error) {
      clearTimeout(timeoutHandle);
      console.error(`[task:${event.taskId}] Error:`, error);

      const isAborted = ac.signal.aborted;
      const errorKind = isAborted ? "timeout" : "cc_crash";
      const errorMsg = isAborted
        ? "timeout"
        : error instanceof Error
          ? error.message
          : String(error);

      await this.redis.publish(
        CHANNELS.TASK_ERROR(event.taskId),
        JSON.stringify({
          taskId: event.taskId,
          kind: errorKind,
          message: errorMsg,
        }),
      );
    } finally {
      clearTimeout(timeoutHandle);
    }
  }
}
