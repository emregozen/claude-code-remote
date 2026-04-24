import { describe, expect, it, vi } from "vitest";

import { RateLimiter } from "../src/rate-limit.js";

describe("RateLimiter", () => {
  it("should allow up to 30 commands per minute", async () => {
    const limiter = new RateLimiter(30);
    const middleware = limiter.middleware();
    const ctx = { from: { id: 123 }, reply: vi.fn() } as any;

    for (let i = 0; i < 30; i++) {
      await middleware(ctx, vi.fn());
      expect(ctx.reply).not.toHaveBeenCalled();
    }
  });

  it("should send a warning on the 31st command", async () => {
    const limiter = new RateLimiter(30);
    const middleware = limiter.middleware();
    const ctx = { from: { id: 123 }, reply: vi.fn() } as any;
    const next = vi.fn();

    for (let i = 0; i < 30; i++) {
      await middleware(ctx, next);
    }

    expect(ctx.reply).not.toHaveBeenCalled();

    await middleware(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith("Rate limited. Max 30 commands per minute.");
    expect(ctx.reply).toHaveBeenCalledTimes(1);
  });

  it("should not reply on the 32nd command (silent reject)", async () => {
    const limiter = new RateLimiter(30);
    const middleware = limiter.middleware();
    const ctx = { from: { id: 123 }, reply: vi.fn() } as any;
    const next = vi.fn();

    for (let i = 0; i < 31; i++) {
      await middleware(ctx, next);
    }

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    ctx.reply.mockClear();

    await middleware(ctx, next);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it("should handle multiple users independently", async () => {
    const limiter = new RateLimiter(30);
    const middleware = limiter.middleware();
    const user1Ctx = { from: { id: 111 }, reply: vi.fn() } as any;
    const user2Ctx = { from: { id: 222 }, reply: vi.fn() } as any;

    for (let i = 0; i < 30; i++) {
      await middleware(user1Ctx, vi.fn());
    }

    for (let i = 0; i < 30; i++) {
      await middleware(user2Ctx, vi.fn());
    }

    expect(user1Ctx.reply).not.toHaveBeenCalled();
    expect(user2Ctx.reply).not.toHaveBeenCalled();

    await middleware(user1Ctx, vi.fn());
    expect(user1Ctx.reply).toHaveBeenCalled();

    user2Ctx.reply.mockClear();
    await middleware(user2Ctx, vi.fn());
    expect(user2Ctx.reply).toHaveBeenCalled();
  });
});
