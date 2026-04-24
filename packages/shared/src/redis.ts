import Redis from "ioredis";

export type RedisClient = Redis;

export async function createRedisClient(url: string, maxRetries = 3): Promise<RedisClient> {
  const redis = new Redis(url);
  let attempts = 0;

  while (attempts < maxRetries) {
    try {
      await redis.ping();
      return redis;
    } catch (error) {
      attempts++;
      if (attempts >= maxRetries) {
        await redis.disconnect();
        throw new Error(
          `Failed to connect to Redis at ${url} after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const delay = 2 ** (attempts - 1) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("Unexpected: redis connection failed");
}
