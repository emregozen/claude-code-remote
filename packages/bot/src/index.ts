import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { createRedisClient } from "@claude-remote/shared";
import { Bot } from "grammy";
import { allowlistMiddleware } from "./auth.js";
import { parseConfig } from "./config.js";
import {
  handleHelp,
  handleNew,
  handleStart,
  handleStatus,
  handleStop,
} from "./handlers/command.js";
import { handleMessage } from "./handlers/message.js";
import { RateLimiter } from "./rate-limit.js";

async function main() {
  const cfg = parseConfig();
  console.log("✓ Config loaded");

  try {
    const redis = await createRedisClient(cfg.REDIS_URL, 3);
    console.log("✓ Redis connected");
    await redis.disconnect();
  } catch (error) {
    console.error(
      "✗ Redis connection failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }

  const bot = new Bot(cfg.TELEGRAM_BOT_TOKEN);

  bot.use(allowlistMiddleware(cfg.ALLOWLIST));

  const rateLimiter = new RateLimiter(30);
  bot.use(rateLimiter.middleware());

  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("status", handleStatus);
  bot.command("stop", handleStop);
  bot.command("new", handleNew);

  bot.on("message", handleMessage);

  console.log("✓ Bot initialized");
  await bot.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
