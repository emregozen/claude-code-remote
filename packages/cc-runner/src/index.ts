import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { createRedisClient } from "@claude-remote/shared";
import { parseConfig } from "./config.js";

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
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
