import { z } from "zod";

const schema = z.object({
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-", "API key must start with 'sk-ant-'"),
  WORKSPACE_PATH: z.string().min(1, "WORKSPACE_PATH required"),
  REDIS_URL: z.string().url().default("redis://redis:6379"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
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
