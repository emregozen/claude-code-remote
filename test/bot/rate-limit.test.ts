import { describe, it, expect, vi, beforeEach } from "vitest";
import { RateLimiter } from "../../src/bot/rate-limit.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllTimers();
    vi.clearAllMocks();
    limiter = new RateLimiter(3); // 3 commands per 60s
  });

  it("allows first request", async () => {
    const result = await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    expect(result.allowed).toBe(true);
  });

  it("allows up to the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const result = await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects when limit exceeded", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    }
    const result = await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    expect(result.allowed).toBe(false);
  });

  it("isolates limits per user", async () => {
    const user1Result = await limiter.checkLimit({ from: { id: 111 } } as any, async () => {});
    expect(user1Result.allowed).toBe(true);

    const user2Result = await limiter.checkLimit({ from: { id: 222 } } as any, async () => {});
    expect(user2Result.allowed).toBe(true);
  });

  it("resets after 60 seconds", async () => {
    for (let i = 0; i < 3; i++) {
      await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    }
    let result = await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    expect(result.allowed).toBe(false);

    vi.useFakeTimers();
    vi.setSystemTime(new Date().getTime() + 61000);

    result = await limiter.checkLimit({ from: { id: 123 } } as any, async () => {});
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });
});
