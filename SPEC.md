# ClaudeRemote — MVP Technical Specification

**Version:** 3.0
**Changelog:** v3.0 — removed Redis and Docker, collapsed to single Node process running on host. Authentication via ~/.claude credentials on host machine.
**Target:** Claude Code / GPT-Codex / equivalent agentic coder
**Status:** authoritative — deviations go in `DEVIATIONS.md`

---

## 0. How to Read This Document (Agent Instructions)

This document is a build specification, not a product brief. It is written to be executed by an AI coding agent with minimal human intervention. Follow these rules when implementing:

1. Read the entire document before writing any code. Do not implement sections in isolation.
2. Section 2 defines the canonical directory layout. All file paths in later sections are relative to the repository root.
3. Section 3 lists every external dependency with exact versions. Do not substitute without justification in a deviation note.
4. Sections 5–10 define each component. Implement in the order listed in Section 12 — each step depends on the previous.
5. Section 11 is the canonical acceptance test suite. The MVP is "done" when every criterion passes, and not before.
6. Any deviation from this spec must be recorded in `DEVIATIONS.md` at the repo root with a one-line justification.
7. If a requirement is ambiguous, stop and ask. Do not guess. Ambiguity in this document is a bug; log it.
8. All code must pass typecheck + lint + tests before committing. No exceptions.

### 0.1 Glossary

- **CC** — Claude Code (the agentic CLI, not this product)
- **CR** — ClaudeRemote (this product)
- **Session** — A continuous CC conversation with persistent context, scoped to one project and one Telegram user
- **Task** — A single user-initiated request, from message send to Stop hook fire
- **Evidence bundle** — The structured completion message posted to Telegram containing diff, test output, and summary
- **Allowlist** — The set of Telegram numeric user IDs permitted to interact with the bot

---

## 1. System Overview

### 1.1 What the MVP does

ClaudeRemote MVP is a single Node.js process (bot + CC runner in one) that allows a pre-authorized Telegram user to send text prompts to a Claude Code session running on the host, receive streamed progress updates, and receive a structured "evidence bundle" message when each task completes.

### 1.2 What the MVP explicitly does not do

- Screenshot generation (web or mobile) — deferred to V1
- Scheduled / cron tasks — deferred to V1
- Approval bridging for CC permission prompts — MVP runs with `--dangerously-skip-permissions`
- Multi-project switching — MVP supports exactly one project per deployment
- Voice input/output — deferred to V1
- Self-verification loop — deferred to V2
- Rollback checkpoints — deferred to V2
- Any cloud / hosted tier — MVP runs only on user's machine
- Docker / containerization — runs as a host process. Add Docker later if a use case demands it (multi-user hosted tier, untrusted workspace, etc.)

### 1.3 Runtime topology

```
┌────────────────────────────────────────────────────┐
│  Host machine (always-on)                          │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │  Node.js process                             │  │
│  │  ┌─────────────────┐  ┌─────────────────┐    │  │
│  │  │  bot (grammY)   │→│ runner (CC SDK)  │    │  │
│  │  │  long-poll      │←│ via direct calls │    │  │
│  │  └─────────────────┘  └─────────────────┘    │  │
│  │              ↓                                 │  │
│  │  ┌──────────────────────────────────────┐    │  │
│  │  │  sqlite (task history)               │    │  │
│  │  │  in-memory Map (active sessions)     │    │  │
│  │  └──────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────┘  │
│                    │                               │
│  Hook HTTP server at 127.0.0.1:4711               │
│                                                    │
│  Mounts: /workspace (user project)                │
│          ~/.claude (CC credentials)               │
└────────────────────────────────────────────────────┘
                    │
                    ▼ HTTPS long-poll
              ┌──────────────┐
              │  Telegram    │
              └──────────────┘
```

### 1.4 End-to-end flow

1. User sends text message to the Telegram bot.
2. Bot receives update via long-poll.
3. Bot checks `sender.id` against `ALLOWLIST` env var. Reject silently if not present.
4. Bot looks up active session in in-memory Map (key: `userId`).
5. Bot calls `runner.runTask(input, onProgress)` directly, passing the prompt, session ID, and a callback.
6. Runner invokes CC SDK with the prompt, passing session ID for resume.
7. As CC streams tool calls and text, runner calls `onProgress(event)` for each progress update.
8. Bot's `onProgress` callback batches updates and edits a single "working..." message in Telegram (max 1 edit per 3s to respect Telegram rate limits).
9. When CC session ends, the Stop hook (shell command registered in CC settings) executes the hook script.
10. Hook script calls the runner's HTTP endpoint (127.0.0.1:4711), which acknowledges the hook.
11. Runner collects evidence: (a) `git diff --stat` since task start, (b) last test command output if test hook ran, (c) final assistant message as summary.
12. Runner returns the evidence bundle to bot.
13. Bot formats and sends the evidence bundle as a new Telegram message. Original "working..." message is deleted.
14. Bot writes task record to sqlite (`tasks` table).

---

## 2. Repository Layout

The repository MUST have exactly this structure. Do not add top-level directories without updating this spec.

```
claude-remote/
├── README.md                    # user-facing setup guide
├── DEVIATIONS.md                # required: log spec deviations here
├── CLAUDE.md                    # anchor file for AI agents
├── .env.example                 # every env var with a safe default
├── .gitignore
├── .editorconfig
├── package.json
├── tsconfig.json                # TS config
├── biome.json                   # linter + formatter config
├── src/
│   ├── index.ts                 # entry; boots config, db, runner, bot modules
│   ├── config.ts                # env parsing, zod schema
│   ├── logger.ts                # pino setup
│   ├── types.ts                 # shared types (TaskInput, ProgressEvent, EvidenceBundle, etc.)
│   ├── bot/
│   │   ├── index.ts             # grammY setup, starts long-poll
│   │   ├── auth.ts              # allowlist check middleware
│   │   ├── handlers/
│   │   │   ├── message.ts       # text message → invoke runner.runTask
│   │   │   └── command.ts       # /start /help /status /stop /new
│   │   ├── progress.ts          # throttled message-edit updater
│   │   └── evidence.ts          # render evidence bundle as Telegram msg
│   ├── runner/
│   │   ├── index.ts             # entry, exports runTask()
│   │   ├── runner.ts            # invokes CC SDK, streams events via callback
│   │   ├── evidence/
│   │   │   ├── collector.ts     # gathers diff/tests/summary
│   │   │   ├── git.ts           # git diff --stat wrapper
│   │   │   └── types.ts         # EvidenceBundle interface
│   │   ├── hooks/
│   │   │   ├── on-stop.sh       # Stop hook script
│   │   │   └── install.ts       # writes CC settings.json with merge/restore
│   │   └── server.ts            # fastify HTTP server for hook callback (127.0.0.1:4711)
│   └── store/
│       ├── db.ts                # better-sqlite3 init + migrations
│       └── task-dao.ts          # task table CRUD
├── test/
│   └── unit tests (vitest)
├── scripts/
│   ├── start.sh                 # runs node dist/index.js with signal handling
│   ├── check-env.sh             # validates required env before boot
│   └── e2e.sh                   # runs the acceptance test suite
└── docs/
    ├── operations.md            # logs, backups, debugging, port verification
    └── troubleshooting.md
```

---

## 3. Dependencies — Exact Versions

Use exactly these versions unless a security advisory forces an upgrade. Record upgrades in `DEVIATIONS.md`.

### 3.1 Runtime

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS | Runtime |
| TypeScript | 5.4.x | Source language |
| grammY | ^1.24.0 | Telegram bot framework |
| @anthropic-ai/claude-code | latest stable | CC SDK |
| better-sqlite3 | ^11.0.0 | Synchronous SQLite, task history |
| zod | ^3.23.0 | Env + event schema validation |
| pino | ^9.0.0 | Structured logging |
| dotenv | ^16.4.0 | Env file loading in dev |
| execa | ^9.0.0 | Child process exec (git, tests) |
| fastify | ^4.28.0 | Hook HTTP server on 127.0.0.1:4711 |

### 3.2 Dev / test

| Dependency | Version | Purpose |
|---|---|---|
| vitest | ^2.0.0 | Unit + integration tests |
| tsx | ^4.15.0 | Run TS directly in dev |
| @biomejs/biome | ^1.8.0 | Linter + formatter (single tool) |
| msw | ^2.3.0 | Mock Telegram API in tests |

### 3.3 System dependencies (on host)

- `git` (required for diff collection)
- `bash` (required for Stop hook script execution)
- `curl` (required for hook → HTTP callback)
- `node` 20.x (must be installed and in PATH)

---

## 4. Configuration

All configuration is via environment variables. There is no config file. The `.env.example` file at the repo root MUST list every variable with a safe default or a placeholder.

### 4.1 Required environment variables

| Variable | Required | Description / validation |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather. Must match `/^\d+:[A-Za-z0-9_-]+$/` |
| `ALLOWLIST` | yes | Comma-separated Telegram numeric user IDs. Min 1 entry. Bot rejects all other senders silently. |
| `WORKSPACE_PATH` | yes | Absolute host path to the user's project. Must be an existing directory and a git repository. |
| `SQLITE_PATH` | no | Default: `./data/claude-remote.db` (relative to cwd on host). Resolved to absolute path at startup. |
| `LOG_LEVEL` | no | Default: `info`. One of: `trace`, `debug`, `info`, `warn`, `error` |
| `PROGRESS_EDIT_INTERVAL_MS` | no | Default: `3000`. Min `1500`. Telegram rate limits editMessageText to ~1/sec per chat. |
| `TASK_TIMEOUT_MS` | no | Default: `1800000` (30 min). Task is force-killed and reported as timeout if exceeded. |
| `HOOK_HTTP_PORT` | no | Default: `4711`. Port for hook HTTP server bound to 127.0.0.1 only. |
| `CC_SKIP_PERMISSIONS` | no | Default: `true` for MVP. MUST be documented as a risk in README. |

### 4.2 Config validation

The process MUST validate config with zod at startup and exit non-zero with a human-readable error if validation fails. Tested in acceptance criterion AC-01.

```ts
// src/config.ts
import { z } from 'zod';
const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  ALLOWLIST: z.string()
    .transform(s => s.split(',').map(Number))
    .pipe(z.array(z.number().int().positive()).min(1)),
  WORKSPACE_PATH: z.string()
    .transform(p => path.resolve(p))
    .refine(p => fs.existsSync(p), 'WORKSPACE_PATH must be an existing directory'),
  SQLITE_PATH: z.string().default('./data/claude-remote.db')
    .transform(p => path.resolve(p)),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error']).default('info'),
  PROGRESS_EDIT_INTERVAL_MS: z.coerce.number().int().min(1500).default(3000),
  TASK_TIMEOUT_MS: z.coerce.number().int().default(1800000),
  HOOK_HTTP_PORT: z.coerce.number().int().min(1024).max(65535).default(4711),
  CC_SKIP_PERMISSIONS: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
});
export const config = schema.parse(process.env);
```

### 4.3 Authentication

ClaudeRemote uses Claude Code's existing host credentials at `$HOME/.claude`. No API key environment variable is needed. The Claude Code SDK reads from the user's home directory automatically when invoked.

**First-time setup:** On the host machine where ClaudeRemote will run:

```bash
claude login
```

This launches an interactive login flow that prompts for the user's Claude account and stores the subscription credentials in `~/.claude/` on the host. Once credentials are stored, ClaudeRemote will use them automatically without prompting.

**How it works:** When the runner module invokes the CC SDK, it uses the same credentials that the `claude` CLI uses. No modification or mount semantics needed — both run in the same user context on the host.

**Credential refresh:** If credentials expire or need to be rotated, re-run `claude login` on the host.

**Verification:** Before starting ClaudeRemote, verify that Claude Code is authenticated:

```bash
claude --version
claude  # interactive test
```

If either command fails, run `claude login` and try again. ClaudeRemote will exit with a clear error if `claude --version` fails at startup (see AC-06).

---

## 5. Shared Event Contracts

The bot and runner communicate via typed function calls and callbacks. All event envelopes are defined in `src/types.ts`. Do not duplicate type definitions.

### 5.1 Task input and callbacks

```ts
// src/types.ts
export interface TaskInput {
  taskId: string;               // uuid v4
  userId: number;               // Telegram user id
  chatId: number;               // Telegram chat id
  sessionId: string | null;     // CC session id to resume, or null
  prompt: string;               // user text
  workspacePath: string;        // absolute path to project
  startSha: string;             // git HEAD before task started
}

export type ProgressCallback = (event: ProgressEvent) => void;

// Bot calls: runner.runTask(input, onProgress) → Promise<EvidenceBundle>
```

### 5.2 Event envelopes

```ts
// packages/shared/src/events.ts

export interface TaskNewEvent {
  taskId: string;           // uuid v4
  userId: number;           // Telegram user id
  chatId: number;           // Telegram chat id for replies
  sessionId: string | null; // CC session id to resume, or null for new
  prompt: string;           // raw user text
  createdAt: string;        // ISO 8601
}

export type ProgressEvent =
  | { taskId: string; kind: 'text'; delta: string }
  | { taskId: string; kind: 'tool_use'; tool: string; summary: string }
  | { taskId: string; kind: 'tool_result'; tool: string; ok: boolean };

export interface EvidenceBundle {
  taskId: string;
  sessionId: string;
  summary: string;              // last assistant text, truncated to 1500 chars
  diff: {
    filesChanged: number;
    insertions: number;
    deletions: number;
    perFile: Array<{ path: string; insertions: number; deletions: number }>;
  };
  tests: { ran: boolean; passed: boolean; output: string | null } | null;
  durationMs: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number | null;
}

export interface TaskCompleteEvent {
  evidence: EvidenceBundle;
}

export interface TaskErrorEvent {
  taskId: string;
  kind: 'timeout' | 'cc_crash' | 'internal';
  message: string;
  stack?: string;
}
```

### 5.3 Session state (in-memory Map)

```ts
// src/store/sessions.ts
const sessions = new Map<number, {
  sessionId: string | null;      // CC session id (for resume), null until first task
  activeTaskId: string | null;   // present iff a task is running
  lastMessageId: number;         // Telegram message id of "working..." message
  updatedAt: Date;
}>();

// Key: userId (from Telegram)
// Cleanup: on /stop or task completion
```

### 5.4 Task record (sqlite)

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,              -- uuid v4
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL              -- 'running' | 'complete' | 'error' | 'timeout'
    CHECK(status IN ('running','complete','error','timeout')),
  evidence_json TEXT,               -- JSON.stringify(EvidenceBundle), null until complete
  error_json TEXT,                  -- JSON.stringify(TaskErrorEvent), null on success
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX idx_tasks_user ON tasks(user_id, started_at DESC);
```

---

## 6. Bot Service — Detailed Spec

### 6.1 Startup sequence

1. Load env via dotenv if `NODE_ENV !== 'production'`.
2. Parse config with zod (section 4.2). Exit 1 on failure with clear error.
3. Open sqlite at `SQLITE_PATH`. Run migrations (idempotent `CREATE TABLE IF NOT EXISTS`).
4. Initialize in-memory session Map.
5. Start runner module (section 7.1).
6. Init grammY bot with `TELEGRAM_BOT_TOKEN`. Register handlers.
7. Start long-polling.
8. Install SIGTERM/SIGINT handler: stop polling, drain in-flight, close sqlite + gracefully shut down runner, exit 0.

### 6.2 Authentication middleware

Every incoming update passes through an allowlist middleware FIRST. Unauthorized senders receive no response (silent reject). This is to prevent user enumeration.

```ts
// packages/bot/src/auth.ts
export const allowlist = (ids: number[]): MiddlewareFn<Context> =>
  async (ctx, next) => {
    const uid = ctx.from?.id;
    if (!uid || !ids.includes(uid)) {
      ctx.log.warn({ uid }, 'reject: not in allowlist');
      return; // silent — no reply
    }
    return next();
  };
```

### 6.3 Command handlers

| Command | Action | Reply |
|---|---|---|
| `/start` | Create / reset session | "ClaudeRemote ready. Project: `<basename(WORKSPACE_PATH)>`. Send a prompt to begin." |
| `/help` | Static help text | List of supported commands + usage hints |
| `/status` | Show current session info | Active task (if any), last N task summaries, uptime |
| `/stop` | Kill current task + reset session | "Task cancelled." or "No active task." |
| `/new` | Discard session, start fresh | "Session cleared." |

### 6.4 Text message handler

When a non-command text message arrives from an allowlisted user:

1. Load session from in-memory Map (key: `userId`). If `activeTaskId` is set, reply "A task is already running. Send /stop first." and return.
2. Generate `taskId = crypto.randomUUID()`.
3. Send placeholder Telegram message: "⏳ Working...". Capture `message_id`.
4. Update session: `activeTaskId = taskId`, `lastMessageId = message_id`, `updatedAt = now`.
5. Capture git HEAD SHA: `git rev-parse HEAD` → `startSha`.
6. Insert tasks row with `status='running'`, `started_at=now`.
7. Call `runner.runTask(input, onProgress)` where:
   - `input` contains taskId, userId, chatId, sessionId, prompt, workspacePath, startSha
   - `onProgress` is a callback that updates the progress message (section 6.5)
8. Start a `TASK_TIMEOUT_MS` timer. If the promise doesn't resolve by then, abort the task and send a timeout error.
9. When the promise resolves with an EvidenceBundle, render the evidence message (section 6.7) and update task row `status='complete'`.

### 6.5 Progress updater

Progress events arrive via the `onProgress` callback from runner. The bot MUST batch them to avoid hitting Telegram rate limits (editMessageText is ~1 req/sec per chat; we use 3s default).

1. Create a callback function passed to `runner.runTask()`: `(event: ProgressEvent) => { ... }`
2. Maintain an in-memory `ProgressState` per taskId: `{ text: string, tools: string[], lastFlushAt: number }`.
3. On each callback invocation, append the event to state but do NOT call `editMessageText` yet.
4. A single interval timer (per task) fires every `PROGRESS_EDIT_INTERVAL_MS`. If state changed since `lastFlushAt`, call `editMessageText` with rendered progress (see 6.6).
5. When the `runTask()` promise resolves, cancel the timer. The calling code then renders the evidence message.

### 6.6 Progress message format

```
⏳ Working...  (2m 14s)

🔧 Bash: running tests
✏️  Edit: src/auth/session.ts
🔍 Read: tests/auth.test.js

...fixing the token expiry assertion...
```

Only the last 3 tool calls are shown. Text delta shown truncated to last 200 chars. Total message length MUST stay under 4000 chars (Telegram limit is 4096).

### 6.7 Evidence message format

On `TaskCompleteEvent`, the bot deletes the progress message and sends a new message with this exact structure (markdown):

```
✅ *Task done*

_<first 200 chars of user's original prompt>_

*Summary*
<evidence.summary, max 1500 chars>

*Changes* — <filesChanged> file(s), +<ins> −<del>
  `<path>` (+<ins> −<del>)
  ... up to 10 files, then "+N more"

*Tests*: ✅ passed  |  ❌ failed  |  — not run

⏱ <durationHuman>   💰 $<costUsd> (<tokensIn>/<tokensOut> tok)
```

If `evidence.tests` is null, omit the Tests line entirely. If `costUsd` is null, show token counts only. All markdown MUST be validated as valid Telegram MarkdownV2 (escape `._*[]()~\`>#+-=|{}!`).

### 6.8 Error handling

- On `TaskErrorEvent` with `kind='timeout'`: edit message to "⏱ Task timed out after `<N>` minutes." Update task row `status='timeout'`.
- On `TaskErrorEvent` with `kind='cc_crash'`: edit message to "💥 Claude Code crashed: `<message>`". Update row `status='error'`.
- On bot-side redis disconnect: drop in-flight tasks from memory, attempt reconnect with exponential backoff. User will see their progress message stop updating. On next send, they get "Previous task was lost due to a service restart. Please resend."
- On SIGTERM mid-task: mark `status='error'` `kind='internal'` `message='bot shutdown'`. Do not try to keep the task running — the cc-runner will also be killed.

---

## 7. CC-Runner Service — Detailed Spec

### 7.1 Startup sequence

1. Parse config (same pattern as bot).
2. Verify `WORKSPACE_PATH` is readable and is a git repo (`git rev-parse --git-dir` in that directory). Exit 1 if not (covers AC-03).
3. Start Fastify HTTP server on `127.0.0.1:4711` (default) for hook callbacks. Bind only to 127.0.0.1, not 0.0.0.0 (covers SEC-03).
4. Install CC hooks: read existing `$HOME/.claude/settings.json`, merge our hooks block into it, write back (section 7.3). On SIGTERM/SIGINT, restore the original file.
5. Export the `runTask()` function for bot to call.
6. Register SIGTERM/SIGINT: kill any in-flight CC process, restore `~/.claude/settings.json`, exit 0.

### 7.2 Task execution loop

The `runTask(input, onProgress)` function is called by the bot and returns a Promise<EvidenceBundle>.

1. On invocation, `taskStartSha` is provided in `input` (captured by bot before calling).
2. Invoke CC SDK (see 7.5) with the prompt and sessionId.
3. For each SDK event, construct a `ProgressEvent` and call `onProgress(event)`.
4. Keep a running tally: `accumulatedText`, `toolCalls[]`, `tokensIn`, `tokensOut`.
5. When SDK reports session end (result message): extract `sessionId` from the result and store it.
6. Call evidence collector (section 8) to gather diff, tests, summary.
7. Return the `EvidenceBundle` to the caller (bot).
8. On SDK error or timeout, throw or reject the promise with appropriate error details.

### 7.3 CC hook configuration

Runner writes to `$HOME/.claude/settings.json` on startup. This is the user's real file on the host.

**Merge strategy:** On startup:
1. Read existing `$HOME/.claude/settings.json` if it exists; save a backup (e.g., `~/.claude/settings.json.backup`).
2. If the file doesn't exist, start with an empty object `{}`.
3. Ensure the `hooks` key exists.
4. Merge our hooks block into `hooks`:
   ```json
   {
     "hooks": {
       "Stop": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "<PATH_TO_on-stop.sh>",
               "timeout": 10
             }
           ]
         }
       ]
     }
   }
   ```
   Use the absolute path to `on-stop.sh` (e.g., resolved from the runner's `__dirname`).
5. Write back to `$HOME/.claude/settings.json`.

**Restore strategy:** On SIGTERM/SIGINT:
1. Restore `$HOME/.claude/settings.json` from the backup created at startup.
2. Log the restore action.

**Note:** If the user has existing hooks defined in their `settings.json`, our merge preserves them (append our Stop hook to their existing hooks array, not overwrite). If restoration fails (e.g., permission denied), log a warning and document recovery steps in `docs/operations.md`.

### 7.4 Stop hook script

```bash
#!/usr/bin/env bash
# src/runner/hooks/on-stop.sh
# CC pipes a JSON payload on stdin; forward to the local runner HTTP API.
set -euo pipefail
PAYLOAD=$(cat)
curl --max-time 8 -s -X POST \
  -H 'Content-Type: application/json' \
  --data "$PAYLOAD" \
  http://127.0.0.1:4711/hook/stop || true  # never fail CC
```

The runner's hook-install logic resolves the absolute path to this script and embeds it into the settings.json config.

### 7.5 CC SDK invocation

Use the streaming API. The exact SDK surface may evolve; if the imported symbol below is wrong, check `@anthropic-ai/claude-code` package exports and update `DEVIATIONS.md`.

```ts
import { query } from '@anthropic-ai/claude-code';

const iter = query({
  prompt,
  options: {
    cwd: '/workspace',
    resume: sessionId ?? undefined,
    permissionMode: config.CC_SKIP_PERMISSIONS ? 'bypassPermissions' : 'default',
    abortController: ac,
  }
});

for await (const msg of iter) {
  switch (msg.type) {
    case 'assistant':
      // publish text delta
      break;
    case 'tool_use':
      // publish tool_use event
      break;
    case 'result':
      // final — capture session_id, tokens, cost
      break;
  }
}
```

---

## 8. Evidence Collector

The evidence collector runs synchronously inside `runner.runTask()` after the CC SDK reports session end. It has access to the accumulated state from the task execution loop.

### 8.1 Inputs

- `taskId`
- `taskStartSha` — git HEAD before the task ran (provided in `input` from bot)
- `workspacePath` — absolute path to user's project (provided in `input` from bot)
- `lastAssistantText` — final text message from CC (accumulated during task)
- `tokensIn`, `tokensOut`, `costUsd` from SDK result event
- `durationMs` from wall clock
- `toolCalls[]` — all tool calls issued during the task

### 8.2 Diff collection

```bash
# run inside $WORKSPACE_PATH
cd $WORKSPACE_PATH
git diff --stat <taskStartSha>..HEAD
git diff --numstat <taskStartSha>..HEAD   # for per-file counts
```

If the workspace is not clean but had uncommitted changes before task start, the bot captures the baseline at task start via `git rev-parse HEAD`. If the task stashes or reverts files mid-run, this may not fully capture the intent, but for MVP we accept this limitation.

If the diff is empty (Claude made no changes), still produce an evidence bundle with `filesChanged=0` and summary containing the final assistant text. Do not treat this as an error.

### 8.3 Test detection (heuristic)

MVP is intentionally dumb about tests. It looks at the task's tool call history for any Bash tool call whose command matches these patterns:

- `npm test`, `npm run test[:*]`, `pnpm test`, `yarn test`
- `pytest`, `python -m pytest`
- `go test ./...`
- `cargo test`
- `mvn test`, `gradle test`

If multiple test runs occurred, use the LAST one. Capture exit code and last 40 lines of combined output. If no test command was run, `tests` is `null`. This heuristic is good enough for MVP; V2's verifier replaces it with a first-class test runner.

### 8.4 Summary

Take the last assistant text message, truncate to 1500 chars. If it is empty or contains only tool calls, substitute: "Task completed. See diff for changes."

---

## 9. Running on the Host

ClaudeRemote runs as a single Node.js process on the host machine. No Docker or containerization is required for MVP.

### 9.1 Prerequisites

- **Node.js 20.x LTS** installed and in `$PATH`
- **git** installed and in `$PATH`
- **bash** installed (for hook script execution)
- **Claude Code CLI** installed and authenticated:
  ```bash
  which claude
  claude login  # if not already authenticated
  claude --version  # verify
  ```
- **Active Telegram bot token** from @BotFather
- **Target project directory** on the host (git repo, absolute path)

### 9.2 Install and configure

1. Clone the repository:
   ```bash
   git clone <repo-url> claude-remote
   cd claude-remote
   ```

2. Install dependencies:
   ```bash
   npm install
   npm run build
   ```

3. Create `.env` from `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `TELEGRAM_BOT_TOKEN` from @BotFather
   - `ALLOWLIST` (your Telegram numeric user ID, comma-separated)
   - `WORKSPACE_PATH` (absolute path to your project)

### 9.3 Running

**Foreground (for testing):**
```bash
npm start
```

The process logs to stdout. Press Ctrl+C to stop.

**Background (production):**

**Using systemd user service:**
```bash
# Create ~/.config/systemd/user/claude-remote.service
[Unit]
Description=ClaudeRemote Telegram Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/claude-remote
ExecStart=/usr/bin/node dist/index.js
Restart=unless-stopped
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Then:
```bash
systemctl --user enable claude-remote
systemctl --user start claude-remote
journalctl --user -f -u claude-remote
```

**Using pm2:**
```bash
npm install -g pm2
pm2 start dist/index.js --name claude-remote
pm2 startup
pm2 save
```

### 9.4 Data and logs

- **SQLite database:** `./data/claude-remote.db` (created automatically)
- **Logs:** stdout via pino (structured JSON). Redirect to a file as needed:
  ```bash
  npm start > claude-remote.log 2>&1 &
  ```

### 9.5 Credentials and security

- **Claude Code auth:** Uses `$HOME/.claude/` credentials (see section 4.3)
- **Settings.json:** ClaudeRemote modifies `$HOME/.claude/settings.json` on startup and restores on shutdown. See section 7.3.
- **Workspace:** Must be a git repo; ClaudeRemote reads and writes to files within it

---

## 10. Logging, Observability, Security

### 10.1 Logging

- All logs are structured JSON via pino, one line per event.
- Every log line MUST include: `service` (`bot`|`runner`), `taskId` (when relevant), `userId` (when relevant), `level`.
- NEVER log the full prompt, assistant text, or diff content at info level or above. Truncate to 80 chars for info; full content only at debug.
- NEVER log credentials, tokens, keys, or secrets, even at trace level. Redact via pino redaction config:
  ```ts
  const logger = pino({
    redact: {
      paths: ['*.*.TOKEN', '*.*.KEY', '*.*.SECRET', '*._TOKEN', '*._KEY', '*._SECRET'],
      censor: '[REDACTED]'
    }
  });
  ```
  This redaction pattern covers `TELEGRAM_BOT_TOKEN`, any `*_TOKEN`, `*_KEY`, `*_SECRET` fields at any depth.

### 10.2 Metrics (MVP scope: log-only)

MVP does not ship Prometheus or OpenTelemetry. Instead, these counters are emitted as structured log events at info level, one line each. A later version can plumb them into a real metrics system.

- `task.started` `{ userId, taskId }`
- `task.completed` `{ taskId, durationMs, tokensIn, tokensOut, costUsd, filesChanged }`
- `task.error` `{ taskId, kind }`
- `task.timeout` `{ taskId, durationMs }`

### 10.3 Security requirements

1. Allowlist enforced in middleware BEFORE any other handler. Silent reject. Covered by test SEC-01.
2. Bot token read from env only. `.env` file MUST be in `.gitignore`. Covered by test SEC-02.
3. **Hook HTTP server binds only to 127.0.0.1 on default port 4711.** Not listening on `0.0.0.0` or any public interface. Verified with `netstat -tnlp | grep 4711` or `ss -tnlp | grep 4711` showing only `127.0.0.1:4711`. Covered by test SEC-03.
4. **CC runs with `--permissionMode bypassPermissions` by default for MVP.** README MUST prominently warn: *"⚠️ IMPORTANT: The bot can run any code on your behalf, including destructive commands like `rm -rf`. Only run ClaudeRemote on a project you control. Consider running this on a dedicated machine or VM if the workspace contains sensitive data or code."* This is more critical now without container isolation. Covered by test SEC-04.
5. No shell interpolation of user input. Any subprocess call that could receive user strings (rare in MVP) MUST use the args array form of execa.
6. Rate limit: max 1 task per user at a time (enforced by `activeTaskId` check). Max 30 messages/minute per user for commands (simple in-memory token bucket).

---

## 11. Acceptance Criteria

This is the canonical list. Every criterion is a pass/fail statement. The MVP is done when all criteria pass. Each criterion has an ID used in commits and issue tracking.

### 11.1 Config and boot

| ID | Area | Pass condition |
|---|---|---|
| AC-01 | Config validation | Missing `TELEGRAM_BOT_TOKEN` causes exit 1 with message containing `TELEGRAM_BOT_TOKEN` within 2s of start. |
| AC-02 | Config validation | Malformed `ALLOWLIST` (e.g., `foo,bar`) causes exit 1 with message containing `ALLOWLIST`. |
| AC-03 | Boot order | Runner verifies `$WORKSPACE_PATH` is a git repo via `git rev-parse --git-dir` in that directory; exits 1 with clear error if not. Bot does not start long-poll until runner is initialized. |
| AC-05 | Settings merge/restore | On startup, `$HOME/.claude/settings.json` is updated with our Stop hook config; a backup of the original is created. On graceful shutdown (SIGTERM/SIGINT), the original is restored. Verified by inspecting the file before, during, and after a run. |
| AC-06 | Claude auth bootstrap | At startup, runner spawns `claude --version` and waits for success. If it fails or is not in PATH, process exits 1 within 3s with clear error message pointing to section 4.3 of README. |

### 11.2 Authentication and security

| ID | Area | Pass condition |
|---|---|---|
| SEC-01 | Allowlist | Message from a non-allowlisted user produces no reply (verified by mock Telegram test; bot sends 0 messages). |
| SEC-02 | Secrets | Grepping the logs directory for `TELEGRAM_BOT_TOKEN` or any `*_TOKEN`, `*_KEY`, `*_SECRET` patterns after a full e2e run returns zero matches. |
| SEC-03 | Port binding | `netstat -tnlp \| grep 4711` (or `ss -tnlp \| grep 4711`) shows hook HTTP port bound only to `127.0.0.1:4711`, never `0.0.0.0:4711`. |
| SEC-04 | Code execution warning | README.md contains the verbatim warning from section 10.3 about arbitrary code execution risk. |

### 11.3 Core loop — happy path

| ID | Area | Pass condition |
|---|---|---|
| E2E-01 | Round trip | Allowlisted user sends "echo hello to README.md"; within `TASK_TIMEOUT_MS` receives an evidence bundle showing README.md changed. |
| E2E-02 | Progress updates | During a task that runs at least 15s, the progress message is edited at least 3 times and at most `(duration_s / 3 + 2)` times. |
| E2E-03 | Session persistence | User sends msg1, receives evidence, sends msg2 that references msg1 ("now undo that"). CC has context from msg1 (verified by CC being able to perform the undo without re-reading the file). |
| E2E-04 | Evidence — diff | After a task that modifies 2 files, the evidence bundle shows exactly 2 entries under Changes with correct +/- counts matching `git diff --numstat` output. |
| E2E-05 | Evidence — tests | After a task where CC runs `npm test` and tests pass, the evidence bundle shows "Tests: ✅ passed". |
| E2E-06 | Evidence — tests | After a task where CC runs `npm test` and a test fails, the evidence bundle shows "Tests: ❌ failed" AND the last 40 lines of test output are included in the session log. |
| E2E-07 | Evidence — no tests | After a task where CC runs no test command, the Tests line is omitted entirely from the evidence bundle. |
| E2E-08 | Evidence — empty diff | After a task where CC only reads files and makes no changes, evidence bundle is still produced with `filesChanged: 0`. |

### 11.4 Core loop — failure modes

| ID | Area | Pass condition |
|---|---|---|
| ERR-01 | Concurrent task | Second text message while a task is running receives reply "A task is already running. Send /stop first." and does NOT invoke runner.runTask a second time. |
| ERR-02 | /stop | `/stop` during a running task aborts CC within 5s, edits progress message to "cancelled", marks task row `status='error'`, clears `activeTaskId`. |
| ERR-03 | Timeout | With `TASK_TIMEOUT_MS=10000` and a prompt that induces a long task, the task is killed at 10s +/- 1s and a timeout error message is sent. |
| ERR-04 | CC crash | If CC process exits non-zero unexpectedly, the promise from runner.runTask rejects and the user sees an error message within 3s. |
| ERR-06 | Process restart | Killing and restarting the process mid-task leaves the task row in `status='running'` in sqlite. On restart, recovery sweep marks unfinished tasks as errors. |

### 11.5 Quality gates (non-functional)

| ID | Area | Pass condition |
|---|---|---|
| QG-01 | Typecheck | `npm run typecheck` exits zero. |
| QG-02 | Lint | `npm run lint` (`biome check .`) exits zero. |
| QG-03 | Format | `biome format --write .` produces no changes on a clean tree (idempotent formatting). |
| QG-04 | Unit tests | `vitest run` exits zero; coverage >= 70% on `src/bot/` and `src/runner/`. |
| QG-05 | E2E | `scripts/e2e.sh` runs all E2E-* and ERR-* criteria against a real running process and exits zero. |
| QG-08 | Startup time | From `npm start` to bot responding to `/start`: under 3s on a warm cache. |

### 11.6 Documentation

| ID | Area | Pass condition |
|---|---|---|
| DOC-01 | README | `README.md` contains: what it is, prerequisites, step-by-step install, `.env` setup, first-run walkthrough, security caveats (the `--skip-permissions` warning verbatim from 10.3.3), troubleshooting pointer. |
| DOC-02 | Ops docs | `docs/operations.md` covers: viewing logs, resetting state (redis + sqlite), backing up sqlite, rotating the bot token. |
| DOC-03 | Deviations | `DEVIATIONS.md` exists and lists every deviation from this spec with one-line justification, or is explicitly empty with a comment stating "no deviations". |

---

## 12. Implementation Order

This spec describes the target architecture after migration from the v2.1 two-container design. For migration instructions, see DEVIATIONS.md. The implementation is already complete at Spec v2.1; this v3.0 spec documents the desired state after restructuring.

### Step 2 — Config + Redis

1. Implement `config.ts` in both packages (section 4.2).
2. Implement shared redis client in both packages.
3. Verify AC-01, AC-02, AC-03.

**Commit:** `feat: config validation and redis wiring`

### Step 3 — Bot skeleton

1. grammY init, allowlist middleware, `/start /help /status /stop /new` handlers.
2. In-memory stub for "active task" (no CC yet): text messages reply with "ok, would run: `<prompt>`".
3. Verify SEC-01 and SEC-04.

**Commit:** `feat: bot auth and commands`

### Step 4 — CC-runner skeleton

1. cc-runner subscribes to `TASK_NEW`, invokes CC SDK (section 7.5), publishes progress events. No evidence collection yet.
2. Bot subscribes to progress, does throttled message edits.
3. Verify E2E-02 partial (progress updates flow end to end).

**Commit:** `feat: task pipeline with streaming progress`

### Step 5 — Evidence collector

1. Install Stop hook script into CC settings (section 7.3).
2. Hook script posts to cc-runner HTTP endpoint (section 7.4).
3. Implement evidence collector (section 8): diff, tests heuristic, summary.
4. Bot renders evidence message (section 6.7).
5. Verify E2E-01, E2E-04..E2E-08.

**Commit:** `feat: evidence bundle on Stop`

### Step 6 — Session persistence

1. Store CC `sessionId` per user in redis; pass to SDK resume option.
2. Verify E2E-03.

**Commit:** `feat: session continuity across messages`

### Step 7 — Error paths and sqlite

1. Implement sqlite schema, task row writes at start and end.
2. Timeout handling, `/stop` abort, CC crash detection, recovery sweep on bot restart.
3. Verify ERR-01..ERR-06.

**Commit:** `feat: error handling and task history`

### Step 8 — Hardening and QG

1. Redact secrets from logs. Pino redaction config. Audit log output for SEC-02.
2. Fill test coverage gaps to reach QG-04 70% target.
3. Run full acceptance suite (`scripts/e2e.sh`). Fix any failures.

**Commit:** `chore: harden and finalize MVP`

### Step 9 — Docs

1. Write `README.md`, `docs/operations.md`, `docs/troubleshooting.md`.
2. Verify DOC-01..DOC-03.

**Tag:** `v0.1.0-mvp`

---

## 13. Open Questions (Resolve Before Implementation)

These are known unknowns. The agent MUST answer each in `DEVIATIONS.md` before starting code changes. If the answer invalidates any spec detail, propose the correction.

**Q6 (Critical):** Does the CC SDK (`@anthropic-ai/claude-code`) respect `$HOME/.claude/` credentials when invoked programmatically (in-process), or does it require an explicit `ANTHROPIC_API_KEY` environment variable even when the host has authenticated via `claude login`? 
- **If:** SDK reads `$HOME/.claude/` directly → proceed with this spec as-is.
- **If:** SDK requires `ANTHROPIC_API_KEY` env var → we need either (a) a fallback to environment variable auth, or (b) shell out to the `claude` CLI binary instead of using the SDK. Either way, major redesign needed.

This must be verified before writing any code. If unclear, test by creating a minimal TypeScript script that imports and calls the SDK without setting `ANTHROPIC_API_KEY`, in an authenticated host environment.

---

## 14. Change Management

- This document is version 3.0. Major versions track architectural boundaries: v1.x (monolithic), v2.x (two-container Docker + Redis), v3.0 (single-process host). Any change bumps the minor version and is dated.
- Implementation deviations go in `DEVIATIONS.md`, not here.
- Scope creep is rejected by default. Any feature not in section 1.1 MUST be deferred to V1 or later.
- If the agent believes a requirement is wrong, it MUST stop, write the concern in `DEVIATIONS.md`, and wait for human confirmation before deviating.
- Re-introducing Redis or Docker as a fallback is not acceptable without explicit justification in `DEVIATIONS.md` and a new spec version bump.
