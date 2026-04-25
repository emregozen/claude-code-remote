import type { Context } from "grammy";
import type { SessionStore } from "../../store/session.js";

export async function handleClaudeCommand(ctx: Context, sessionStore: SessionStore): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const text = ctx.message?.text ?? "";
  const parts = text.split(/\s+/).slice(1);
  const subcommand = parts[0]?.toLowerCase();

  if (!subcommand) {
    await ctx.reply(
      "*Claude Code Commands*\n\n/claude status – Show session status\n/claude restart – Restart session\n\nUse `/claude <command>` to run.",
      { parse_mode: "Markdown" },
    );
    return;
  }

  switch (subcommand) {
    case "status":
      return handleClaudeStatus(ctx, sessionStore, userId);
    case "restart":
      return handleClaudeRestart(ctx, sessionStore, userId);
    default:
      await ctx.reply(`Unknown command: \`/claude ${subcommand}\``, {
        parse_mode: "Markdown",
      });
  }
}

async function handleClaudeStatus(
  ctx: Context,
  sessionStore: SessionStore,
  userId: number,
): Promise<void> {
  const session = sessionStore.getSession(userId);

  if (!session || !session.sessionId) {
    await ctx.reply("No active Claude Code session\\. Use /start to begin\\.", {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const statusLines = [
    "*Claude Code Session*",
    `Session ID: \`${session.sessionId.substring(0, 12)}\\...\``,
    `Model: \`${session.model}\``,
    `Effort: \`${session.effort}\``,
    `Budget: ${session.maxBudgetUsd ? `\\$${session.maxBudgetUsd}` : "Unlimited"}`,
    `Active Task: ${session.activeTaskId ? "Yes" : "No"}`,
  ];

  await ctx.reply(statusLines.join("\n"), { parse_mode: "MarkdownV2" });
}

async function handleClaudeRestart(
  ctx: Context,
  sessionStore: SessionStore,
  userId: number,
): Promise<void> {
  const session = sessionStore.getSession(userId);

  if (!session) {
    await ctx.reply("No session to restart\\. Use /start to begin\\.", {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  if (session.activeTaskId) {
    await ctx.reply("Cannot restart while a task is running\\. Use /stop first\\.", {
      parse_mode: "MarkdownV2",
    });
    return;
  }

  const newSession = {
    ...session,
    sessionId: null,
  };
  sessionStore.setSession(userId, newSession);

  await ctx.reply("Claude Code session restarted\\. The next task will start a fresh session\\.", {
    parse_mode: "MarkdownV2",
  });
}
