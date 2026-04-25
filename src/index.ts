import { execSync } from "node:child_process";
import { config as loadDotenv } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  loadDotenv();
}

import { initBot } from "./bot/index.js";
import { parseConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { installCCHooks } from "./runner/hooks/install.js";
import { createRunner } from "./runner/index.js";
import { createHookServer } from "./runner/server.js";
import { SQLiteStore } from "./store/db.js";

async function main() {
  const cfg = parseConfig();
  console.log("✓ Config loaded");

  const logger = createLogger(cfg);

  // Verify Claude CLI is installed and authenticated (AC-06)
  try {
    execSync("claude --version", { stdio: "pipe" });
    console.log("✓ Claude CLI authenticated");
  } catch {
    console.error("✗ Claude CLI not found or not authenticated");
    console.error("  Run: claude login");
    console.error("  See README.md section 4.3 for details");
    process.exit(1);
  }

  // Initialize SQLite
  const sqliteStore = new SQLiteStore(cfg.SQLITE_PATH);
  console.log("✓ SQLite initialized");

  sqliteStore.markInFlightAsError();
  console.log("✓ Recovery sweep completed");

  // Install CC hooks and manage settings.json
  const cleanupHooks = await installCCHooks(cfg.HOOK_HTTP_PORT);
  console.log("✓ CC hooks installed");

  // Start hook HTTP server
  await createHookServer(cfg.HOOK_HTTP_PORT);
  console.log(`✓ Hook server running on 127.0.0.1:${cfg.HOOK_HTTP_PORT}`);

  // Create runner instance
  const runner = await createRunner(cfg);
  console.log("✓ Runner initialized");

  // Initialize bot
  const bot = await initBot(cfg, logger, runner, sqliteStore);
  console.log("✓ Bot initialized");

  // Start bot polling
  await bot.start();
  console.log("✓ Bot polling started");

  // Handle graceful shutdown
  const handleShutdown = async () => {
    console.log("\nShutting down gracefully...");
    await bot.stop();
    await cleanupHooks();
    sqliteStore.close();
    process.exit(0);
  };

  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
