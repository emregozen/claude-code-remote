import type { Context, MiddlewareFn } from "grammy";

export function allowlistMiddleware(allowedIds: number[]): MiddlewareFn<Context> {
  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !allowedIds.includes(userId)) {
      return;
    }
    return next();
  };
}
