import { basename } from "node:path";

import type { Context } from "grammy";
import type { SessionStore } from "../../store/session.js";

const AVAILABLE_MODELS = ["opus", "sonnet", "haiku"];
const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

export async function handleStart(ctx: Context): Promise<void> {
  const projectName = basename(process.env.WORKSPACE_PATH || "/workspace");
  await ctx.reply(`ClaudeRemote ready. Project: \`${projectName}\`. Send a prompt to begin.`);
}

export async function handleHelp(ctx: Context): Promise<void> {
  const helpText = `*ClaudeRemote Commands*

/start – Initialize session
/help – Show this message
/model – View or change Claude model
/status – Show session status
/stop – Cancel current task
/new – Clear session and start fresh

Send any text message to run a task.`;
  await ctx.reply(helpText, { parse_mode: "Markdown" });
}

export async function handleStatus(ctx: Context): Promise<void> {
  await ctx.reply("No active session yet.");
}

export async function handleStop(ctx: Context): Promise<void> {
  await ctx.reply("No active task.");
}

export async function handleNew(ctx: Context): Promise<void> {
  await ctx.reply("Session cleared.");
}

export async function handleModel(ctx: Context, sessionStore: SessionStore): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
  const requested = args[0]?.toLowerCase();

  if (!requested) {
    const session = sessionStore.getSession(userId);
    const currentModel = session?.model ?? "sonnet";
    const currentFull = MODEL_MAP[currentModel] || currentModel;

    const modelList = AVAILABLE_MODELS.map((m) => `\`${m}\``).join(", ");
    await ctx.reply(
      `*Current model*: ${currentFull}\n\n*Available models*: ${modelList}\n\nUse \`/model opus\`, \`/model sonnet\`, or \`/model haiku\` to switch.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  if (!AVAILABLE_MODELS.includes(requested)) {
    await ctx.reply(
      `Unknown model: \`${requested}\`. Available: ${AVAILABLE_MODELS.map((m) => `\`${m}\``).join(", ")}`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const session = sessionStore.getSession(userId) ?? {
    sessionId: null,
    activeTaskId: null,
    lastMessageId: null,
    updatedAt: new Date().toISOString(),
    model: "sonnet",
  };

  session.model = requested;
  sessionStore.setSession(userId, session);

  const fullName = MODEL_MAP[requested];
  await ctx.reply(`Model set to \`${fullName}\` for future tasks.`, {
    parse_mode: "Markdown",
  });
}
