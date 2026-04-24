import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { randomUUID } from "node:crypto";
import type { Context } from "grammy";
import pino from "pino";

import { CHANNELS, createRedisClient } from "@claude-remote/shared";
import type {
  ProgressEvent,
  TaskCompleteEvent,
  TaskErrorEvent,
  TaskNewEvent,
} from "@claude-remote/shared";
import { Bot } from "grammy";

import { allowlistMiddleware } from "./auth.js";
import { parseConfig } from "./config.js";
import { renderEvidence } from "./evidence.js";
import { handleHelp, handleNew, handleStart, handleStatus } from "./handlers/command.js";
import { ProgressUpdater } from "./progress.js";
import { RateLimiter } from "./rate-limit.js";
import { RedisStore } from "./store/redis.js";
import { SessionStore } from "./store/session.js";
import { SQLiteStore } from "./store/sqlite.js";

async function main() {
  const cfg = parseConfig();
  console.log("✓ Config loaded");

  const logger = pino({
    redact: {
      paths: ["TELEGRAM_BOT_TOKEN", "ANTHROPIC_API_KEY"],
      remove: true,
    },
  });

  const redis = await createRedisClient(cfg.REDIS_URL, 3);
  console.log("✓ Redis connected");

  const sqliteStore = new SQLiteStore(cfg.SQLITE_PATH);
  console.log("✓ SQLite initialized");

  sqliteStore.markInFlightAsError();
  console.log("✓ Recovery sweep completed");

  const redisStore = new RedisStore(redis);
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

    const redisSession = await redisStore.getSession(userId);
    const ccSessionId = (redisSession?.sessionId as string | undefined) ?? null;

    const newSession = {
      sessionId: ccSessionId,
      activeTaskId: taskId,
      lastMessageId: msg.message_id,
      updatedAt: new Date().toISOString(),
    };
    sessionStore.setSession(userId, newSession);

    const taskEvent: TaskNewEvent = {
      taskId,
      userId,
      chatId: ctx.chat?.id ?? 0,
      sessionId: ccSessionId,
      prompt,
      createdAt: new Date().toISOString(),
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

    await redisStore.publishTaskNew(taskEvent);

    const progressState = sessionStore.getProgress(taskId);
    const updater = new ProgressUpdater(
      ctx,
      msg.message_id,
      progressState,
      cfg.PROGRESS_EDIT_INTERVAL_MS,
    );

    const timeoutTimer = setTimeout(() => {
      void handleTaskTimeout(
        ctx,
        taskId,
        userId,
        msg.message_id,
        sessionStore,
        sqliteStore,
        redis as any,
      );
    }, cfg.TASK_TIMEOUT_MS);

    await redisStore.subscribeToProgress(taskId, (event: ProgressEvent) => {
      updater.onProgressEvent(event);
    });

    await redisStore.subscribeToTaskComplete(taskId, async (completeEvent: TaskCompleteEvent) => {
      clearTimeout(timeoutTimer);
      await updater.cleanup();
      sessionStore.deleteProgress(taskId);
      const sess = sessionStore.getSession(userId);
      if (sess) {
        sess.activeTaskId = null;
        sessionStore.setSession(userId, sess);
      }
      await redisStore.setSession(userId, {
        sessionId: completeEvent.evidence.sessionId,
        updatedAt: new Date().toISOString(),
      });
      sqliteStore.updateTaskComplete(
        taskId,
        JSON.stringify(completeEvent.evidence),
        new Date().toISOString(),
      );
      try {
        await ctx.api.deleteMessage(ctx.chatId, msg.message_id);
      } catch {
        // Ignore delete errors
      }
      const evidenceMsg = renderEvidence(completeEvent.evidence, prompt);
      await ctx.api.sendMessage(ctx.chatId, evidenceMsg, {
        parse_mode: "MarkdownV2",
      });
    });

    await redisStore.subscribeToTaskError(taskId, async (errorEvent: Record<string, unknown>) => {
      const typedError = errorEvent as unknown as TaskErrorEvent;
      clearTimeout(timeoutTimer);
      await updater.cleanup();
      sessionStore.deleteProgress(taskId);
      const sess = sessionStore.getSession(userId);
      if (sess) {
        sess.activeTaskId = null;
        sessionStore.setSession(userId, sess);
      }
      const status = typedError.kind === "timeout" ? "timeout" : "error";
      sqliteStore.updateTaskError(
        taskId,
        JSON.stringify(typedError),
        new Date().toISOString(),
        status,
      );
      try {
        await ctx.api.deleteMessage(ctx.chatId, msg.message_id);
      } catch {
        // Ignore delete errors
      }
      if (typedError.kind === "timeout") {
        const durationMin = Math.floor(cfg.TASK_TIMEOUT_MS / 60000);
        await ctx.reply(`⏱ Task timed out after ${durationMin} minutes.`);
      } else if (typedError.kind === "cc_crash") {
        await ctx.reply(`💥 Claude Code crashed: \`${typedError.message}\``);
      } else {
        await ctx.reply("❌ Task failed");
      }
    });
  });

  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down...");
    sqliteStore.markInFlightAsError();
    sqliteStore.close();
    process.exit(0);
  });

  console.log("✓ Bot initialized");
  await bot.start();
}

async function handleStopCommand(
  ctx: Context,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
): Promise<void> {
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
  sqliteStore.updateTaskError(
    taskId,
    JSON.stringify({
      taskId,
      kind: "internal",
      message: "cancelled by user",
    }),
    new Date().toISOString(),
    "error",
  );
  await ctx.reply("Task cancelled.");
}

async function handleNewCommand(
  ctx: Context,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const session = sessionStore.getSession(userId);
  if (session?.activeTaskId) {
    sqliteStore.updateTaskError(
      session.activeTaskId,
      JSON.stringify({
        taskId: session.activeTaskId,
        kind: "internal",
        message: "session cleared",
      }),
      new Date().toISOString(),
      "error",
    );
  }
  sessionStore.deleteSession(userId);
  await ctx.reply("Session cleared.");
}

async function handleTaskTimeout(
  ctx: Context,
  taskId: string,
  userId: number,
  messageId: number,
  sessionStore: SessionStore,
  sqliteStore: SQLiteStore,
  redis: any,
): Promise<void> {
  const chatId = ctx.chatId ?? 0;

  const sess = sessionStore.getSession(userId);
  if (sess?.activeTaskId === taskId) {
    sess.activeTaskId = null;
    sessionStore.setSession(userId, sess);
  }

  sqliteStore.updateTaskError(
    taskId,
    JSON.stringify({
      taskId,
      kind: "timeout",
      message: "task exceeded timeout",
    }),
    new Date().toISOString(),
    "timeout",
  );

  try {
    await ctx.api.deleteMessage(chatId, messageId);
  } catch {
    // Ignore delete errors
  }

  // Publish timeout event to cc-runner
  await redis.publish(
    `cr:task:error:${taskId}`,
    JSON.stringify({
      taskId,
      kind: "timeout",
      message: "timeout",
    }),
  );
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
