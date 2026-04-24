export const CHANNELS = {
  TASK_NEW: "cr:task:new",
  TASK_PROGRESS: (id: string) => `cr:task:progress:${id}`,
  TASK_COMPLETE: (id: string) => `cr:task:complete:${id}`,
  TASK_ERROR: (id: string) => `cr:task:error:${id}`,
} as const;
