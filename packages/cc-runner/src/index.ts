import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { CHANNELS, createRedisClient } from "@claude-remote/shared";
import type { TaskNewEvent } from "@claude-remote/shared";
import { parseConfig } from "./config.js";
import { CCRunner } from "./runner.js";

async function main() {
  const cfg = parseConfig();
  console.log("✓ Config loaded");

  // Verify workspace is a git repo
  if (!existsSync(cfg.WORKSPACE_PATH)) {
    console.error(`✗ Workspace path does not exist: ${cfg.WORKSPACE_PATH}`);
    process.exit(1);
  }

  try {
    execSync("git rev-parse --git-dir", {
      cwd: cfg.WORKSPACE_PATH,
      stdio: "pipe",
    });
    console.log("✓ Workspace is a git repository");
  } catch {
    console.error(`✗ Workspace is not a git repository: ${cfg.WORKSPACE_PATH}`);
    process.exit(1);
  }

  const redis = await createRedisClient(cfg.REDIS_URL, 3);
  console.log("✓ Redis connected");

  const runner = new CCRunner(redis);

  const sub = redis.duplicate();
  sub.on("message", async (channel, message) => {
    if (channel === CHANNELS.TASK_NEW) {
      const event = JSON.parse(message) as TaskNewEvent;
      await runner.executeTask(event);
    }
  });

  await sub.subscribe(CHANNELS.TASK_NEW);
  console.log("✓ cc-runner listening for tasks");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
