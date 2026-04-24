import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  const originalEnv = process.env;
  const originalExit = process.exit;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("loads valid config", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    process.env.ALLOWLIST = "123,456";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SQLITE_PATH = "/tmp/test.db";

    const config = parseConfig();
    expect(config.TELEGRAM_BOT_TOKEN).toBe("123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef");
    expect(config.ALLOWLIST).toEqual([123, 456]);
    expect(config.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("exits on missing TELEGRAM_BOT_TOKEN", () => {
    process.env.TELEGRAM_BOT_TOKEN = undefined;
    process.env.ALLOWLIST = "123";

    expect(() => parseConfig()).toThrow();
  });

  it("exits on malformed ALLOWLIST", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    process.env.ALLOWLIST = "not-a-number";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.SQLITE_PATH = "/tmp/test.db";

    expect(() => parseConfig()).toThrow();
  });

  it("uses default values for optional env vars", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    process.env.ALLOWLIST = "123";
    process.env.REDIS_URL = undefined;
    process.env.SQLITE_PATH = undefined;
    process.env.TASK_TIMEOUT_MS = undefined;
    process.env.PROGRESS_EDIT_INTERVAL_MS = undefined;

    const config = parseConfig();
    expect(config.REDIS_URL).toBeDefined();
    expect(config.SQLITE_PATH).toBeDefined();
    expect(config.TASK_TIMEOUT_MS).toBe(1800000);
    expect(config.PROGRESS_EDIT_INTERVAL_MS).toBe(3000);
  });
});
