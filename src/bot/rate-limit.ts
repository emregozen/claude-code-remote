import type { Context, MiddlewareFn } from "grammy";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  sentWarning: boolean;
}

export class RateLimiter {
  private buckets = new Map<number, TokenBucket>();
  private readonly maxTokens: number;
  private readonly refillRate: number;

  constructor(maxCommandsPer60s = 30) {
    this.maxTokens = maxCommandsPer60s;
    this.refillRate = maxCommandsPer60s / 60000;
  }

  private refillBucket(bucket: TokenBucket): void {
    const now = Date.now();
    const timePassed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.maxTokens, bucket.tokens + timePassed * this.refillRate);
    bucket.lastRefill = now;
  }

  private getBucket(userId: number): TokenBucket {
    if (!this.buckets.has(userId)) {
      this.buckets.set(userId, {
        tokens: this.maxTokens,
        lastRefill: Date.now(),
        sentWarning: false,
      });
    }
    const bucket = this.buckets.get(userId);
    if (!bucket) {
      throw new Error("Unexpected: bucket not found");
    }
    this.refillBucket(bucket);
    return bucket;
  }

  async checkLimit(
    ctx: Context,
    next: () => Promise<void>,
  ): Promise<{ allowed: boolean; shouldReply: boolean }> {
    const userId = ctx.from?.id;
    if (!userId) {
      return { allowed: true, shouldReply: false };
    }

    const bucket = this.getBucket(userId);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      bucket.sentWarning = false;
      return { allowed: true, shouldReply: false };
    }

    if (!bucket.sentWarning) {
      bucket.sentWarning = true;
      return { allowed: false, shouldReply: true };
    }

    return { allowed: false, shouldReply: false };
  }

  middleware(): MiddlewareFn<Context> {
    return async (ctx, next) => {
      const result = await this.checkLimit(ctx, next);

      if (result.allowed) {
        return next();
      }

      if (result.shouldReply) {
        await ctx.reply("Rate limited. Max 30 commands per minute.");
      }
    };
  }
}
