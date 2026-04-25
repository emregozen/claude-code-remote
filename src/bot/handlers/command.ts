import { basename } from "node:path";

import type { Context } from "grammy";

export async function handleStart(ctx: Context): Promise<void> {
  const projectName = basename(process.env.WORKSPACE_PATH || "/workspace");
  await ctx.reply(`ClaudeRemote ready. Project: \`${projectName}\`. Send a prompt to begin.`);
}

export async function handleHelp(ctx: Context): Promise<void> {
  const helpText = `*ClaudeRemote Commands*

/start – Initialize session
/help – Show this message
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
