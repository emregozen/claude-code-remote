import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { randomUUID } from "node:crypto";

import { CHANNELS, createRedisClient } from "@claude-remote/shared";
import type { ProgressEvent, TaskCompleteEvent, TaskNewEvent } from "@claude-remote/shared";
import { Bot } from "grammy";

import { allowlistMiddleware } from "./auth.js";
import { parseConfig } from "./config.js";
import { renderEvidence } from "./evidence.js";
import {
  handleHelp,
  handleNew,
  handleStart,
  handleStatus,
  handleStop,
} from "./handlers/command.js";
import { ProgressUpdater } from "./progress.js";
import { RateLimiter } from "./rate-limit.js";
import { RedisStore } from "./store/redis.js";
import { SessionStore } from "./store/session.js";

async function main() {
  const cfg = parseConfig();
  console.log("✓ Config loaded");

  const redis = await createRedisClient(cfg.REDIS_URL, 3);
  console.log("✓ Redis connected");

  const redisStore = new RedisStore(redis);
  const sessionStore = new SessionStore();

  const bot = new Bot(cfg.TELEGRAM_BOT_TOKEN);

  bot.use(allowlistMiddleware(cfg.ALLOWLIST));

  const rateLimiter = new RateLimiter(30);
  bot.use(rateLimiter.middleware());

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);
  bot.command("stop", handleStop);
  bot.command("new", handleNew);

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

    await redisStore.publishTaskNew(taskEvent);

    const progressState = sessionStore.getProgress(taskId);
    const updater = new ProgressUpdater(
      ctx,
      msg.message_id,
      progressState,
      cfg.PROGRESS_EDIT_INTERVAL_MS,
    );

    await redisStore.subscribeToProgress(taskId, (event: ProgressEvent) => {
      updater.onProgressEvent(event);
    });

    await redisStore.subscribeToTaskComplete(taskId, async (completeEvent: TaskCompleteEvent) => {
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

    await redisStore.subscribeToTaskError(taskId, async () => {
      await updater.cleanup();
      sessionStore.deleteProgress(taskId);
      const sess = sessionStore.getSession(userId);
      if (sess) {
        sess.activeTaskId = null;
        sessionStore.setSession(userId, sess);
      }
      try {
        await ctx.api.deleteMessage(ctx.chatId, msg.message_id);
      } catch {
        // Ignore delete errors
      }
      await ctx.reply("❌ Task failed");
    });
  });

  console.log("✓ Bot initialized");
  await bot.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
