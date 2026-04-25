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
import { handleHelp, handleStart, handleStatus } from "./handlers/command.js";
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

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);
  bot.command("stop", (ctx) => handleStopCommand(ctx, sessionStore, sqliteStore));
  bot.command("new", (ctx) => handleNewCommand(ctx, sessionStore, sqliteStore));

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

    const newSession = {
      sessionId: ccSessionId,
      activeTaskId: taskId,
      lastMessageId: msg.message_id,
      updatedAt: new Date().toISOString(),
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
      await ctx.editMessageText(
        `⏱ Task timed out after ${Math.round(cfg.TASK_TIMEOUT_MS / 60000)} minutes.`,
      );
      sqliteStore.updateTaskStatus(taskId, "timeout");
    }, cfg.TASK_TIMEOUT_MS);

    const onProgress: ProgressCallback = (event) => {
      updater.onProgressEvent(event);
    };

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

      await ctx.deleteMessage();
      await ctx.reply(renderEvidence(evidence, prompt), { parse_mode: "MarkdownV2" });
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

      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error({ taskId, error: errorMsg }, "Task failed");
      await ctx.editMessageText(`💥 Error: ${errorMsg}`);
      sqliteStore.updateTaskStatus(taskId, "error");
    }
  });

  return bot;
}

async function handleStopCommand(
  ctx: Context,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
) {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const session = sessionStore.getSession(userId);
  if (!session?.activeTaskId) {
    await ctx.reply("No active task.");
    return;
  }

  const taskId = session.activeTaskId;
  session.activeTaskId = null;
  sessionStore.setSession(userId, session);

  sqliteStore.updateTaskStatus(taskId, "error");
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
  });

  await ctx.reply("Session cleared.");
}
