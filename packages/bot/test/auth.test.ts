import { describe, expect, it, vi } from "vitest";

import { allowlistMiddleware } from "../src/auth.js";

describe("allowlistMiddleware", () => {
  it("should call next for allowlisted users", async () => {
    const next = vi.fn();
    const middleware = allowlistMiddleware([123, 456]);
    const ctx = { from: { id: 123 } } as any;

    await middleware(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it("should not call next for non-allowlisted users", async () => {
    const next = vi.fn();
    const middleware = allowlistMiddleware([123, 456]);
    const ctx = { from: { id: 789 } } as any;

    await middleware(ctx, next);
    expect(next).not.toHaveBeenCalled();
  });

  it("should not call next if user is missing", async () => {
    const next = vi.fn();
    const middleware = allowlistMiddleware([123, 456]);
    const ctx = { from: undefined } as any;

    await middleware(ctx, next);
    expect(next).not.toHaveBeenCalled();
  });
});
