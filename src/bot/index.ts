import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Context } from "grammy";
import { Bot } from "grammy";
import type { Config } from "../config.js";
import type { Logger } from "../logger.js";
import type { Runner } from "../runner/index.js";
import type { SQLiteStore } from "../store/db.js";
import { SessionStore } from "../store/session.js";
import type { EvidenceBundle, ProgressCallback, TaskInput } from "../types.js";
import { allowlistMiddleware } from "./auth.js";
import { renderEvidence } from "./evidence.js";
import { handleClaudeCommand } from "./handlers/claude-commands.js";
import {
  handleBudget,
  handleEffort,
  handleHelp,
  handleMode,
  handleModel,
  handleNew,
  handleStart,
  handleStatus,
  handleStop,
} from "./handlers/command.js";
import { ProgressUpdater } from "./progress.js";
import { RateLimiter } from "./rate-limit.js";

export async function initBot(
  cfg: Config,
  logger: Logger,
  runner: Runner,
  sqliteStore: SQLiteStore,
) {
  const sessionStore = new SessionStore();
  const bot = new Bot(cfg.TELEGRAM_BOT_TOKEN);

  bot.use(allowlistMiddleware(cfg.ALLOWLIST));

  const rateLimiter = new RateLimiter(30);
  bot.use(rateLimiter.middleware());

  const pendingApprovals = new Map<
    string,
    {
      resolve: (approved: boolean) => void;
      taskId: string;
      messageId: number;
      timeoutHandle: NodeJS.Timeout;
    }
  >();

  bot.command("start", async (ctx) => {
    try {
      await handleStart(ctx);
    } catch (error) {
      logger.error({ error }, "/start command failed");
    }
  });
  bot.command("help", async (ctx) => {
    try {
      await handleHelp(ctx);
    } catch (error) {
      logger.error({ error }, "/help command failed");
    }
  });
  bot.command("status", async (ctx) => {
    try {
      await handleStatus(ctx);
    } catch (error) {
      logger.error({ error }, "/status command failed");
    }
  });
  bot.command("model", async (ctx) => {
    try {
      await handleModel(ctx, sessionStore);
    } catch (error) {
      logger.error({ error }, "/model command failed");
    }
  });
  bot.command("effort", async (ctx) => {
    try {
      await handleEffort(ctx, sessionStore);
    } catch (error) {
      logger.error({ error }, "/effort command failed");
    }
  });
  bot.command("budget", async (ctx) => {
    try {
      await handleBudget(ctx, sessionStore);
    } catch (error) {
      logger.error({ error }, "/budget command failed");
    }
  });
  bot.command("mode", async (ctx) => {
    try {
      await handleMode(ctx, sessionStore);
    } catch (error) {
      logger.error({ error }, "/mode command failed");
    }
  });
  bot.command("claude", async (ctx) => {
    try {
      await handleClaudeCommand(ctx, sessionStore);
    } catch (error) {
      logger.error({ error }, "/claude command failed");
    }
  });
  bot.command("stop", async (ctx) => {
    try {
      console.log(`[command:/stop] Received from user ${ctx.from?.id}`);
      await handleStopCommand(ctx, sessionStore, sqliteStore, runner);
    } catch (error) {
      console.error("[command:/stop] Error:", error);
      logger.error({ error }, "/stop command failed");
    }
  });
  bot.command("new", async (ctx) => {
    try {
      await handleNewCommand(ctx, sessionStore, sqliteStore);
    } catch (error) {
      logger.error({ error }, "/new command failed");
    }
  });

  try {
    await bot.api.setMyCommands([
      { command: "start", description: "Initialize session" },
      { command: "help", description: "Show available commands" },
      { command: "model", description: "View or change Claude model" },
      { command: "effort", description: "View or set effort level" },
      { command: "budget", description: "View or set budget limit" },
      { command: "mode", description: "View or change approval mode" },
      { command: "status", description: "Show session status" },
      { command: "stop", description: "Cancel current task" },
      { command: "new", description: "Clear session and start fresh" },
      { command: "claude", description: "Manage Claude Code sessions" },
    ]);
    console.log("✓ Telegram command menu registered");
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to register command menu with Telegram",
    );
  }

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const match = data.match(/^(approve|deny):(.+)$/);

    if (!match) {
      await ctx.answerCallbackQuery({ text: "Invalid callback data" });
      return;
    }

    const [, action, requestId] = match;
    const pending = pendingApprovals.get(requestId);

    if (!pending) {
      await ctx.answerCallbackQuery({ text: "Approval request expired" });
      return;
    }

    const approved = action === "approve";
    pending.resolve(approved);
    pendingApprovals.delete(requestId);

    const statusText = approved ? "✅ Approved — continuing task" : "❌ Denied — stopping task";
    try {
      await ctx.editMessageText(statusText);
    } catch {
      await ctx.reply(statusText).catch(() => {
        // Silent fail
      });
    }
    await ctx.answerCallbackQuery();
  });

  bot.on("message", async (ctx) => {
    const prompt = ctx.message?.text;
    if (!prompt) {
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      return;
    }

    const session = sessionStore.getSession(userId);
    if (session?.activeTaskId) {
      await ctx.reply("A task is already running. Send /stop first.");
      return;
    }

    const taskId = randomUUID();
    const msg = await ctx.reply("⏳ Working...");

    const ccSessionId = session?.sessionId ?? null;

    const currentSession = sessionStore.getSession(userId);
    const newSession = {
      sessionId: ccSessionId,
      activeTaskId: taskId,
      lastMessageId: msg.message_id,
      updatedAt: new Date().toISOString(),
      model: currentSession?.model ?? "sonnet",
      effort: currentSession?.effort ?? "medium",
      maxBudgetUsd: currentSession?.maxBudgetUsd ?? null,
      approvalMode: currentSession?.approvalMode ?? "safe",
    };
    sessionStore.setSession(userId, newSession);

    const startSha = execSync("git rev-parse HEAD", {
      cwd: cfg.WORKSPACE_PATH,
      encoding: "utf-8",
    }).trim();

    const taskInput: TaskInput = {
      taskId,
      userId,
      chatId: ctx.chat?.id ?? 0,
      sessionId: ccSessionId,
      prompt,
      workspacePath: cfg.WORKSPACE_PATH,
      startSha,
      model: newSession.model,
      effort: newSession.effort,
      maxBudgetUsd: newSession.maxBudgetUsd,
      approvalMode: newSession.approvalMode,
    };

    sqliteStore.insertTask({
      id: taskId,
      user_id: userId,
      chat_id: ctx.chat?.id ?? 0,
      session_id: ccSessionId ?? "",
      prompt,
      status: "running",
      started_at: new Date().toISOString(),
    });

    const progressState = sessionStore.getProgress(taskId);
    const updater = new ProgressUpdater(
      ctx,
      msg.message_id,
      progressState,
      cfg.PROGRESS_EDIT_INTERVAL_MS,
    );

    const timeoutTimer = setTimeout(async () => {
      clearTimeout(timeoutTimer);
      await updater.cleanup();
      sessionStore.deleteProgress(taskId);
      const sess = sessionStore.getSession(userId);
      if (sess) {
        sess.activeTaskId = null;
        sessionStore.setSession(userId, sess);
      }

      const timeoutMsg = `⏱ Task timed out after ${Math.round(cfg.TASK_TIMEOUT_MS / 60000)} minutes\\.`;
      try {
        await ctx.editMessageText(timeoutMsg);
      } catch {
        try {
          await ctx.reply(timeoutMsg, { parse_mode: "MarkdownV2" });
        } catch {
          await ctx.reply("⏱ Task timed out");
        }
      }

      sqliteStore.updateTaskStatus(taskId, "timeout");
    }, cfg.TASK_TIMEOUT_MS);

    const onProgress: ProgressCallback = (event) => {
      if (event.kind === "permission_request") {
        (async () => {
          const approvalMsg = await ctx.reply(
            `🔐 *Permission Required*\n\nTool: \`${event.tool}\`\nAction: ${event.description}`,
            {
              parse_mode: "Markdown",
              reply_markup: {
                inline_keyboard: [
                  [
                    { text: "✅ Allow", callback_data: `approve:${event.requestId}` },
                    { text: "❌ Deny", callback_data: `deny:${event.requestId}` },
                  ],
                ],
              },
            },
          );

          const timeoutHandle = setTimeout(() => {
            pendingApprovals.delete(event.requestId);
            runner.resolveApproval(event.requestId, false);
          }, 60000);

          pendingApprovals.set(event.requestId, {
            resolve: (approved) => {
              clearTimeout(timeoutHandle);
              runner.resolveApproval(event.requestId, approved);
            },
            taskId,
            messageId: approvalMsg.message_id,
            timeoutHandle,
          });
        })();
      } else {
        updater.onProgressEvent(event);
      }
    };

    // Run task in background without blocking so /stop can be processed
    (async () => {
      try {
        const evidence = await runner.runTask(taskInput, onProgress);
        clearTimeout(timeoutTimer);
        await updater.cleanup();
        sessionStore.deleteProgress(taskId);

        const sess = sessionStore.getSession(userId);
        if (sess) {
          sess.sessionId = evidence.sessionId;
          sess.activeTaskId = null;
          sessionStore.setSession(userId, sess);
        }

        await ctx.deleteMessage().catch(() => {
          // Already deleted or doesn't exist
        });
        await ctx
          .reply(renderEvidence(evidence, prompt), { parse_mode: "MarkdownV2" })
          .catch((e) => {
            logger.error({ error: e }, "Failed to send evidence message");
          });
        sqliteStore.updateTaskStatus(taskId, "complete", evidence);
      } catch (error) {
        clearTimeout(timeoutTimer);
        await updater.cleanup();
        sessionStore.deleteProgress(taskId);
        const sess = sessionStore.getSession(userId);
        if (sess) {
          sess.activeTaskId = null;
          sessionStore.setSession(userId, sess);
        }

        // Check if task was cancelled by user (via /stop command)
        const isCanceled =
          (error as any)?.isCanceled === true ||
          (error instanceof Error && error.message.includes("canceled"));
        if (isCanceled) {
          console.log(`[task:${taskId}] Task was cancelled by user`);
          await ctx.editMessageText("⏹️ Task cancelled.").catch(() => {
            return ctx.reply("⏹️ Task cancelled.").catch(() => {
              // Silent fail
            });
          });
          sqliteStore.updateTaskStatus(taskId, "error");
        } else {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          logger.error({ taskId, error: errorMsg }, "Task failed");

          const escapedError = errorMsg.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, (c) => `\\${c}`);
          const errorText = `💥 Error: ${escapedError}`;

          await ctx.editMessageText(errorText).catch(() => {
            return ctx.reply(errorText, { parse_mode: "MarkdownV2" }).catch(() => {
              return ctx.reply("❌ Task failed (error details unavailable)").catch(() => {
                // Silent fail
              });
            });
          });

          sqliteStore.updateTaskStatus(taskId, "error");
        }
      }
    })();
  });

  return bot;
}

async function handleStopCommand(
  ctx: Context,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
  runner: Runner,
) {
  const userId = ctx.from?.id;
  if (!userId) {
    console.log("[command:/stop] No userId found");
    return;
  }

  console.log(`[command:/stop] Processing for user ${userId}`);
  const session = sessionStore.getSession(userId);
  if (!session?.activeTaskId) {
    console.log(`[command:/stop] No active task for user ${userId}`);
    await ctx.reply("No active task.");
    return;
  }

  const taskId = session.activeTaskId;
  console.log(`[command:/stop] Killing task ${taskId}`);
  session.activeTaskId = null;
  sessionStore.setSession(userId, session);

  runner.stopTask(taskId);
  sqliteStore.updateTaskStatus(taskId, "error");
  console.log(`[command:/stop] User ${userId} stopped task ${taskId}`);
  await ctx.reply("Task cancelled.");
}

async function handleNewCommand(
  ctx: Context,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
) {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const session = sessionStore.getSession(userId);
  if (session?.activeTaskId) {
    await ctx.reply("A task is running. Send /stop first.");
    return;
  }

  sessionStore.setSession(userId, {
    sessionId: null,
    activeTaskId: null,
    lastMessageId: 0,
    updatedAt: new Date().toISOString(),
    model: session?.model ?? "sonnet",
    effort: session?.effort ?? "medium",
    maxBudgetUsd: session?.maxBudgetUsd ?? null,
    approvalMode: session?.approvalMode ?? "bypass",
  });

  console.log(`[command:/new] User ${userId} cleared session`);
  await ctx.reply("Session cleared.");
}
