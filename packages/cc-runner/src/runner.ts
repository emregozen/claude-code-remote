import type { RedisClient } from "@claude-remote/shared";
import { CHANNELS } from "@claude-remote/shared";
import type { ProgressEvent, TaskCompleteEvent, TaskNewEvent } from "@claude-remote/shared";

export class CCRunner {
  constructor(private redis: RedisClient) {}

  async executeTask(event: TaskNewEvent): Promise<void> {
    console.log(`[task:${event.taskId}] Starting execution`);

    let accumulatedText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    const startTime = Date.now();

    try {
      // Dynamic import of @anthropic-ai/claude-code
      // @ts-ignore - SDK types may not be available at compile time
      const { query } = await import("@anthropic-ai/claude-code");

      const iter = query({
        prompt: event.prompt,
        options: {
          cwd: "/workspace",
          resume: event.sessionId ?? undefined,
          permissionMode: "bypassPermissions",
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
          const progressEvent: ProgressEvent = {
            taskId: event.taskId,
            kind: "tool_use",
            tool: (msg.tool ?? "unknown") as string,
            summary: (msg.summary ?? "...") as string,
          };
          await this.redis.publish(
            CHANNELS.TASK_PROGRESS(event.taskId),
            JSON.stringify(progressEvent),
          );
        } else if (msg.type === "result") {
          const sessionId = msg.session_id;
          tokensIn = (msg.tokens_input ?? 0) as number;
          tokensOut = (msg.tokens_output ?? 0) as number;

          const durationMs = Date.now() - startTime;
          const completeEvent: TaskCompleteEvent = {
            evidence: {
              taskId: event.taskId,
              sessionId: String(sessionId ?? event.sessionId),
              summary: accumulatedText.slice(-1500),
              diff: {
                filesChanged: 0,
                insertions: 0,
                deletions: 0,
                perFile: [],
              },
              tests: null,
              durationMs,
              tokensInput: tokensIn,
              tokensOutput: tokensOut,
              costUsd: null,
            },
          };

          await this.redis.publish(
            CHANNELS.TASK_COMPLETE(event.taskId),
            JSON.stringify(completeEvent),
          );
          console.log(`[task:${event.taskId}] Completed in ${durationMs}ms`);
        }
      }
    } catch (error) {
      console.error(`[task:${event.taskId}] Error:`, error);
      await this.redis.publish(
        CHANNELS.TASK_ERROR(event.taskId),
        JSON.stringify({
          taskId: event.taskId,
          kind: "cc_crash",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
