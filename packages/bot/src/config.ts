import { z } from "zod";

const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/, "Invalid Telegram bot token format"),
  ALLOWLIST: z
    .string()
    .transform((s) => s.split(",").map((id) => Number.parseInt(id.trim(), 10)))
    .pipe(z.array(z.number().int().positive()).min(1, "At least one user ID required")),
  REDIS_URL: z.string().url().default("redis://redis:6379"),
  SQLITE_PATH: z.string().default("/data/claude-remote.db"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  PROGRESS_EDIT_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1500, "Min 1500ms to respect Telegram rate limits")
    .default(3000),
  TASK_TIMEOUT_MS: z.coerce.number().int().positive().default(1800000),
  CC_SKIP_PERMISSIONS: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .default("true"),
});

export type Config = z.infer<typeof schema>;

export function parseConfig(): Config {
  try {
    return schema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("\n");
      console.error(`Config validation failed:\n${message}`);
      process.exit(1);
    }
    throw error;
  }
}
