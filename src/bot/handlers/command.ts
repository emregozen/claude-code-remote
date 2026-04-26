import { basename } from "node:path";

import type { Context } from "grammy";
import type { SessionStore } from "../../store/session.js";

const AVAILABLE_MODELS = ["opus", "sonnet", "haiku"];
const MODEL_MAP: Record<string, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

const AVAILABLE_EFFORTS = ["low", "medium", "high", "max"];
const EFFORT_DESCRIPTIONS: Record<string, string> = {
  low: "Fast but less thorough",
  medium: "Balanced (default)",
  high: "More thorough, slower",
  max: "Maximum effort, very slow",
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
/effort – View or change effort level
/budget – View or set budget limit
/mode – View or change approval mode
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
    effort: "medium",
    maxBudgetUsd: null,
    approvalMode: "bypass",
  };

  session.model = requested;
  sessionStore.setSession(userId, session);

  const fullName = MODEL_MAP[requested];
  await ctx.reply(`Model set to \`${fullName}\` for future tasks.`, {
    parse_mode: "Markdown",
  });
}

export async function handleEffort(ctx: Context, sessionStore: SessionStore): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
  const requested = args[0]?.toLowerCase();

  if (!requested) {
    const session = sessionStore.getSession(userId);
    const currentEffort = session?.effort ?? "medium";

    const effortList = AVAILABLE_EFFORTS.map((e) => {
      const desc = EFFORT_DESCRIPTIONS[e];
      return `\`${e}\` — ${desc}`;
    }).join("\n");

    await ctx.reply(
      `*Current effort*: ${currentEffort}\n\n*Available effort levels*:\n${effortList}\n\nUse \`/effort low\`, \`/effort medium\`, \`/effort high\`, or \`/effort max\` to change.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  if (!AVAILABLE_EFFORTS.includes(requested)) {
    await ctx.reply(
      `Unknown effort level: \`${requested}\`. Available: ${AVAILABLE_EFFORTS.map((e) => `\`${e}\``).join(", ")}`,
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
    effort: "medium",
    maxBudgetUsd: null,
    approvalMode: "bypass",
  };

  session.effort = requested;
  sessionStore.setSession(userId, session);

  const desc = EFFORT_DESCRIPTIONS[requested];
  await ctx.reply(`Effort set to \`${requested}\` — ${desc}`, {
    parse_mode: "Markdown",
  });
}

export async function handleBudget(ctx: Context, sessionStore: SessionStore): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
  const requested = args[0]?.toLowerCase();

  if (!requested || requested === "show" || requested === "view") {
    const session = sessionStore.getSession(userId);
    const currentBudget = session?.maxBudgetUsd;

    if (currentBudget === null || currentBudget === undefined) {
      await ctx.reply(
        "*Current budget*: Unlimited\n\nUse `/budget <amount>` to set a limit (e.g., `/budget 5` for $5)",
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        `*Current budget*: \\$${currentBudget}\n\nUse \`/budget <amount>\` to change or \`/budget unlimited\` to remove limit`,
        { parse_mode: "MarkdownV2" },
      );
    }
    return;
  }

  if (requested === "unlimited" || requested === "none") {
    const session = sessionStore.getSession(userId) ?? {
      sessionId: null,
      activeTaskId: null,
      lastMessageId: null,
      updatedAt: new Date().toISOString(),
      model: "sonnet",
      effort: "medium",
      maxBudgetUsd: null,
      approvalMode: "bypass",
    };

    session.maxBudgetUsd = null;
    sessionStore.setSession(userId, session);

    await ctx.reply("Budget limit removed. Tasks can spend unlimited amount.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const budget = Number.parseFloat(requested);
  if (Number.isNaN(budget) || budget <= 0) {
    await ctx.reply(
      `Invalid budget: \`${requested}\`. Use a positive number (e\.g\., \`/budget 5\`)`,
      { parse_mode: "MarkdownV2" },
    );
    return;
  }

  const session = sessionStore.getSession(userId) ?? {
    sessionId: null,
    activeTaskId: null,
    lastMessageId: null,
    updatedAt: new Date().toISOString(),
    model: "sonnet",
    effort: "medium",
    maxBudgetUsd: null,
    approvalMode: "bypass",
  };

  session.maxBudgetUsd = budget;
  sessionStore.setSession(userId, session);

  await ctx.reply(`Budget set to \\$${budget} per task\\.`, {
    parse_mode: "MarkdownV2",
  });
}

const AVAILABLE_MODES = ["bypass", "auto-edit", "manual"];
const MODE_DESCRIPTIONS: Record<string, string> = {
  bypass: "Skip all permission checks (dangerous)",
  "auto-edit": "Auto-accept file edits, prompt for shell commands",
  manual: "Require Telegram approval for each risky action",
};

export async function handleMode(ctx: Context, sessionStore: SessionStore): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    return;
  }

  const args = ctx.message?.text?.split(/\s+/).slice(1) ?? [];
  const requested = args[0]?.toLowerCase();

  if (!requested) {
    const session = sessionStore.getSession(userId);
    const currentMode = session?.approvalMode ?? "bypass";

    const modeList = AVAILABLE_MODES.map((m) => {
      const desc = MODE_DESCRIPTIONS[m];
      return `\`${m}\` — ${desc}`;
    }).join("\n");

    await ctx.reply(
      `*Current approval mode*: ${currentMode}\n\n*Available modes*:\n${modeList}\n\nUse \`/mode bypass\`, \`/mode auto-edit\`, or \`/mode manual\` to change.`,
      { parse_mode: "Markdown" },
    );
    return;
  }

  if (!AVAILABLE_MODES.includes(requested)) {
    await ctx.reply(
      `Unknown mode: \`${requested}\`. Available: ${AVAILABLE_MODES.map((m) => `\`${m}\``).join(", ")}`,
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
    effort: "medium",
    maxBudgetUsd: null,
    approvalMode: "bypass",
  };

  session.approvalMode = requested as "bypass" | "auto-edit" | "manual";
  sessionStore.setSession(userId, session);

  const desc = MODE_DESCRIPTIONS[requested];
  await ctx.reply(`Approval mode set to \`${requested}\` — ${desc}`, {
    parse_mode: "Markdown",
  });
}
