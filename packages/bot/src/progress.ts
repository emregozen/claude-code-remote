import type { ProgressEvent } from "@claude-remote/shared";
import type { Context } from "grammy";
import type { ProgressState } from "./store/session.js";

export class ProgressUpdater {
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private ctx: Context,
    private messageId: number,
    private progressState: ProgressState,
    private editIntervalMs: number,
  ) {}

  async onProgressEvent(event: ProgressEvent): Promise<void> {
    if (event.kind === "text") {
      this.progressState.text = event.delta;
    } else if (event.kind === "tool_use") {
      this.progressState.tools = [
        ...this.progressState.tools.slice(-2),
        `${event.tool}: ${event.summary}`,
      ];
    }

    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.editIntervalMs);
  }

  private async flush(): Promise<void> {
    const message = this.renderProgress();
    try {
      if (this.ctx.chatId !== undefined && this.messageId !== undefined) {
        await this.ctx.api.editMessageText(this.ctx.chatId, this.messageId, message);
      }
      this.progressState.lastFlushAt = Date.now();
    } catch (error) {
      if (error instanceof Error) {
        console.error("Failed to edit progress message:", error.message);
      }
    }
  }

  private renderProgress(): string {
    const elapsed = Math.round((Date.now() - this.progressState.lastFlushAt) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${minutes}m ${seconds}s`;

    const toolsStr = this.progressState.tools
      .slice(-3)
      .map((t) => `🔧 ${t}`)
      .join("\n");

    const textPreview = this.progressState.text.slice(-200);

    const parts = [`⏳ Working...  (${timeStr})`];
    if (toolsStr) {
      parts.push("");
      parts.push(toolsStr);
    }
    if (textPreview) {
      parts.push("");
      parts.push(textPreview);
    }

    return parts.join("\n").slice(0, 4000);
  }

  async cleanup(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
