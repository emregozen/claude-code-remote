import { describe, it, expect, vi } from "vitest";
import type { Context } from "grammy";
import { allowlistMiddleware } from "../../src/bot/auth.js";

describe("allowlistMiddleware", () => {
  it("allows a user in the allowlist", async () => {
    const next = vi.fn();
    const ctx = {
      from: { id: 123 },
    } as unknown as Context;

    const middleware = allowlistMiddleware([123, 456]);
    await middleware(ctx, next);

    expect(next).toHaveBeenCalled();
  });

  it("silently rejects a user not in the allowlist", async () => {
    const next = vi.fn();
    const ctx = {
      from: { id: 999 },
    } as unknown as Context;

    const middleware = allowlistMiddleware([123, 456]);
    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("silently rejects when ctx.from is undefined", async () => {
    const next = vi.fn();
    const ctx = {
      from: undefined,
    } as unknown as Context;

    const middleware = allowlistMiddleware([123, 456]);
    await middleware(ctx, next);

    expect(next).not.toHaveBeenCalled();
  });

  it("allows multiple users in the allowlist", async () => {
    const next = vi.fn();
    const allowlist = [111, 222, 333];

    for (const id of allowlist) {
      const ctx = { from: { id } } as unknown as Context;
      const middleware = allowlistMiddleware(allowlist);
      await middleware(ctx, next);
    }

    expect(next).toHaveBeenCalledTimes(3);
  });
});
