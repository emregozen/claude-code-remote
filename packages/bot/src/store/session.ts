export interface SessionState {
  sessionId: string | null;
  activeTaskId: string | null;
  lastMessageId: number | null;
  updatedAt: string;
}

export interface ProgressState {
  text: string;
  tools: string[];
  lastFlushAt: number;
}

export class SessionStore {
  private sessions = new Map<number, SessionState>();
  private progress = new Map<string, ProgressState>();

  getSession(userId: number): SessionState | null {
    return this.sessions.get(userId) ?? null;
  }

  setSession(userId: number, state: SessionState): void {
    this.sessions.set(userId, state);
  }

  deleteSession(userId: number): void {
    this.sessions.delete(userId);
  }

  getProgress(taskId: string): ProgressState {
    if (!this.progress.has(taskId)) {
      this.progress.set(taskId, {
        text: "",
        tools: [],
        lastFlushAt: Date.now(),
      });
    }
    const progress = this.progress.get(taskId);
    if (!progress) {
      throw new Error("Unexpected: progress not found");
    }
    return progress;
  }

  deleteProgress(taskId: string): void {
    this.progress.delete(taskId);
  }
}
