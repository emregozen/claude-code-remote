import type { RedisClient } from "@claude-remote/shared";
import { CHANNELS } from "@claude-remote/shared";
import type { ProgressEvent, TaskCompleteEvent, TaskNewEvent } from "@claude-remote/shared";

export class RedisStore {
  constructor(private redis: RedisClient) {}

  async subscribeToProgress(
    taskId: string,
    callback: (event: ProgressEvent) => void,
  ): Promise<void> {
    const sub = this.redis.duplicate();
    sub.on("message", (channel, message) => {
      if (channel === CHANNELS.TASK_PROGRESS(taskId)) {
        callback(JSON.parse(message));
      }
    });
    await sub.subscribe(CHANNELS.TASK_PROGRESS(taskId));
  }

  async subscribeToTaskComplete(
    taskId: string,
    callback: (event: TaskCompleteEvent) => void,
  ): Promise<void> {
    const sub = this.redis.duplicate();
    sub.on("message", (channel, message) => {
      if (channel === CHANNELS.TASK_COMPLETE(taskId)) {
        callback(JSON.parse(message));
      }
    });
    await sub.subscribe(CHANNELS.TASK_COMPLETE(taskId));
  }

  async subscribeToTaskError(
    taskId: string,
    callback: (error: Record<string, unknown>) => void | Promise<void>,
  ): Promise<void> {
    const sub = this.redis.duplicate();
    sub.on("message", (channel, message) => {
      if (channel === CHANNELS.TASK_ERROR(taskId)) {
        void callback(JSON.parse(message) as Record<string, unknown>);
      }
    });
    await sub.subscribe(CHANNELS.TASK_ERROR(taskId));
  }

  async publishTaskNew(event: TaskNewEvent): Promise<void> {
    await this.redis.publish(CHANNELS.TASK_NEW, JSON.stringify(event));
  }

  async setSession(userId: number, sessionData: Record<string, unknown>): Promise<void> {
    await this.redis.hset(`cr:session:${userId}`, sessionData);
  }

  async getSession(userId: number): Promise<Record<string, unknown> | null> {
    const data = await this.redis.hgetall(`cr:session:${userId}`);
    return Object.keys(data).length === 0 ? null : data;
  }

  async deleteSession(userId: number): Promise<void> {
    await this.redis.del(`cr:session:${userId}`);
  }
}
