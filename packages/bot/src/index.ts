import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config();
}

import { createRedisClient } from "@claude-remote/shared";
import { parseConfig } from "./config.js";

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
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
