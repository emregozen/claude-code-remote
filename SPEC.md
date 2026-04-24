# ClaudeRemote — MVP Technical Specification

**Version:** 1.0
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

ClaudeRemote MVP is a two-container Docker stack (bot + CC runner) that allows a pre-authorized Telegram user to send text prompts to a Claude Code session running on the host, receive streamed progress updates, and receive a structured "evidence bundle" message when each task completes.

### 1.2 What the MVP explicitly does not do

- Screenshot generation (web or mobile) — deferred to V1
- Scheduled / cron tasks — deferred to V1
- Approval bridging for CC permission prompts — MVP runs with `--dangerously-skip-permissions`
- Multi-project switching — MVP supports exactly one project per deployment
- Voice input/output — deferred to V1
- Self-verification loop — deferred to V2
- Rollback checkpoints — deferred to V2
- Any cloud / hosted tier — MVP runs only on user's machine

### 1.3 Runtime topology

```
┌───────────────────────────────────────────────────────────────┐
│  Host machine (always-on)                                     │
│                                                               │
│  ┌────────────────┐      ┌────────────────────────────────┐   │
│  │  bot (Node)    │◀────▶│  redis (session, pubsub)       │   │
│  │  grammY        │      └────────────────────────────────┘   │
│  │  long-poll     │                                           │
│  └───────┬────────┘      ┌────────────────────────────────┐   │
│          │               │  sqlite volume                 │   │
│          │               │  (evidence history, sessions)  │   │
│          │               └────────────────────────────────┘   │
│          │ spawn / stream                                     │
│          ▼                                                    │
│  ┌───────────────────────────────────────────────────────┐    │
│  │  cc-runner (Node)                                     │    │
│  │   - wraps @anthropic-ai/claude-code SDK               │    │
│  │   - mounts /workspace (user project, read-write)      │    │
│  │   - mounts /hooks (CR hook scripts)                   │    │
│  │   - writes evidence events to redis pubsub            │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
                           │
                           ▼ HTTPS long-poll
                     ┌──────────────┐
                     │  Telegram    │
                     └──────────────┘
```

### 1.4 End-to-end flow

1. User sends text message to the Telegram bot.
2. Bot container receives update via long-poll.
3. Bot checks `sender.id` against `ALLOWLIST` env var. Reject silently if not present.
4. Bot looks up active session in redis (key: `cr:session:{userId}`).
5. Bot spawns a task: publishes to redis channel `cr:task:new` with the prompt and session ID.
6. cc-runner (subscribed to `cr:task:new`) invokes CC SDK with the prompt, passing session ID for resume.
7. As CC streams tool calls and text, cc-runner publishes progress events to redis channel `cr:task:progress:{taskId}`.
8. Bot subscribes to `cr:task:progress:{taskId}`, edits a single "working..." message in Telegram with batched progress (max 1 edit per 3s to respect Telegram rate limits).
9. When CC session ends, the Stop hook (shell command registered in CC settings) executes `/app/hooks/on-stop.sh`.
10. `on-stop.sh` calls the cc-runner evidence endpoint, which collects: (a) `git diff --stat` since task start, (b) last test command output if test hook ran, (c) final assistant message as summary.
11. cc-runner publishes `cr:task:complete:{taskId}` with the evidence bundle payload.
12. Bot formats and sends the evidence bundle as a new Telegram message. Original "working..." message is deleted.
13. Bot writes task record to sqlite (`tasks` table).

---

## 2. Repository Layout

The repository MUST have exactly this structure. Do not add top-level directories without updating this spec.

```
claude-remote/
├── README.md                    # user-facing setup guide
├── DEVIATIONS.md                # required: log spec deviations here
├── CLAUDE.md                    # anchor file for AI agents
├── docker-compose.yml           # primary deployment artifact
├── .env.example                 # every env var with a safe default
├── .gitignore
├── .editorconfig
├── package.json                 # root workspaces config
├── tsconfig.base.json           # shared TS config
├── biome.json                   # linter + formatter config
├── packages/
│   ├── bot/                     # Telegram bot service
│   │   ├── src/
│   │   │   ├── index.ts         # entry, boots grammY
│   │   │   ├── config.ts        # env parsing, zod schema
│   │   │   ├── auth.ts          # allowlist check
│   │   │   ├── handlers/
│   │   │   │   ├── message.ts   # text message → task
│   │   │   │   ├── command.ts   # /start /help /status /stop
│   │   │   │   └── callback.ts  # (stub for V1 approval buttons)
│   │   │   ├── progress.ts      # throttled message-edit updater
│   │   │   ├── evidence.ts      # render evidence bundle as Telegram msg
│   │   │   ├── store/
│   │   │   │   ├── redis.ts     # session + pubsub client
│   │   │   │   └── sqlite.ts    # task history DAO
│   │   │   └── logger.ts        # pino
│   │   ├── test/                # vitest unit tests
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── cc-runner/               # Claude Code SDK wrapper
│   │   ├── src/
│   │   │   ├── index.ts         # entry, subscribes to task:new
│   │   │   ├── config.ts
│   │   │   ├── runner.ts        # invokes CC SDK, streams events
│   │   │   ├── evidence/
│   │   │   │   ├── collector.ts # gathers diff/tests/summary on Stop
│   │   │   │   ├── git.ts       # git diff --stat wrapper
│   │   │   │   └── types.ts     # EvidenceBundle interface
│   │   │   ├── hooks/
│   │   │   │   ├── on-stop.sh   # Stop hook script, copied into CC config
│   │   │   │   └── install.ts   # writes CC settings.json on startup
│   │   │   ├── server.ts        # tiny HTTP server for hook callback
│   │   │   └── logger.ts
│   │   ├── test/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/                  # shared types / contracts
│       ├── src/
│       │   ├── events.ts        # Task/Progress/Evidence event types
│       │   ├── channels.ts      # redis channel name constants
│       │   └── index.ts
│       └── package.json
├── scripts/
│   ├── setup.sh                 # one-command installer
│   ├── check-env.sh             # validates required env before boot
│   └── e2e.sh                   # runs the acceptance test suite
└── docs/
    ├── architecture.md
    ├── operations.md            # logs, backups, debugging
    └── troubleshooting.md
```

---

## 3. Dependencies — Exact Versions

Use exactly these versions unless a security advisory forces an upgrade. Record upgrades in `DEVIATIONS.md`.

### 3.1 Runtime

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | 20.x LTS | Runtime for bot and cc-runner |
| TypeScript | 5.4.x | Source language |
| grammY | ^1.24.0 | Telegram bot framework |
| @anthropic-ai/claude-code | latest stable | CC SDK (installed in cc-runner image) |
| ioredis | ^5.4.0 | Redis client, pub/sub |
| better-sqlite3 | ^11.0.0 | Synchronous SQLite, task history |
| zod | ^3.23.0 | Env + event schema validation |
| pino | ^9.0.0 | Structured logging |
| dotenv | ^16.4.0 | Env file loading in dev |
| execa | ^9.0.0 | Child process exec (git, tests) |
| fastify | ^4.28.0 | cc-runner hook HTTP server |

### 3.2 Dev / test

| Dependency | Version | Purpose |
|---|---|---|
| vitest | ^2.0.0 | Unit + integration tests |
| tsx | ^4.15.0 | Run TS directly in dev |
| @biomejs/biome | ^1.8.0 | Linter + formatter (single tool) |
| msw | ^2.3.0 | Mock Telegram API in tests |

### 3.3 System dependencies (in Docker images)

- `git` (required in cc-runner for diff collection)
- `bash` (required in cc-runner for Stop hook script)
- `curl` (required in cc-runner for hook → HTTP callback)
- `redis:7-alpine` (compose service)
- `node:20-alpine` as base image

---

## 4. Configuration

All configuration is via environment variables. There is no config file. The `.env.example` file at the repo root MUST list every variable with a safe default or a placeholder.

### 4.1 Required environment variables

| Variable | Required | Description / validation |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather. Must match `/^\d+:[A-Za-z0-9_-]+$/` |
| `ALLOWLIST` | yes | Comma-separated Telegram numeric user IDs. Min 1 entry. Bot rejects all other senders silently. |
| `ANTHROPIC_API_KEY` | yes | API key for Claude Code SDK. Must start with `sk-ant-` |
| `WORKSPACE_PATH` | yes | Absolute host path to the user's project. Mounted into cc-runner at `/workspace`. Must be an existing directory. |
| `REDIS_URL` | no | Default: `redis://redis:6379` (compose service name) |
| `SQLITE_PATH` | no | Default: `/data/claude-remote.db` (mounted volume) |
| `LOG_LEVEL` | no | Default: `info`. One of: `trace`, `debug`, `info`, `warn`, `error` |
| `PROGRESS_EDIT_INTERVAL_MS` | no | Default: `3000`. Min `1500`. Telegram rate limits editMessageText to ~1/sec per chat. |
| `TASK_TIMEOUT_MS` | no | Default: `1800000` (30 min). Task is force-killed and reported as timeout if exceeded. |
| `CC_SKIP_PERMISSIONS` | no | Default: `true` for MVP. MUST be documented as a risk in README. |

### 4.2 Config validation

Both services MUST validate config with zod at startup and exit non-zero with a human-readable error if validation fails. Tested in acceptance criterion AC-01.

```ts
// packages/bot/src/config.ts
import { z } from 'zod';
const schema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().regex(/^\d+:[A-Za-z0-9_-]+$/),
  ALLOWLIST: z.string()
    .transform(s => s.split(',').map(Number))
    .pipe(z.array(z.number().int().positive()).min(1)),
  REDIS_URL: z.string().url().default('redis://redis:6379'),
  SQLITE_PATH: z.string().default('/data/claude-remote.db'),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error']).default('info'),
  PROGRESS_EDIT_INTERVAL_MS: z.coerce.number().int().min(1500).default(3000),
});
export const config = schema.parse(process.env);
```

---

## 5. Shared Event Contracts

All inter-service communication uses redis pub/sub with strongly-typed event envelopes defined in `packages/shared`. These types are the contract; do not duplicate them.

### 5.1 Channel names

```ts
// packages/shared/src/channels.ts
export const CHANNELS = {
  TASK_NEW: 'cr:task:new',                                  // bot → cc-runner
  TASK_PROGRESS: (id: string) => `cr:task:progress:${id}`,  // cc-runner → bot
  TASK_COMPLETE: (id: string) => `cr:task:complete:${id}`,  // cc-runner → bot
  TASK_ERROR: (id: string) => `cr:task:error:${id}`,        // cc-runner → bot
} as const;
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

### 5.3 Session state (redis)

```
KEY: cr:session:{userId}
TYPE: hash
FIELDS:
  sessionId: string        // CC session id (for --resume)
  activeTaskId: string?    // present iff a task is running for this user
  lastMessageId: string    // Telegram message id of "working..." message
  updatedAt: string        // ISO 8601
TTL: none (manual cleanup via /stop)
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
3. Connect to Redis. Ping. Exit 1 if unreachable after 3 retries (1s, 2s, 4s backoff).
4. Open sqlite at `SQLITE_PATH`. Run migrations (idempotent `CREATE TABLE IF NOT EXISTS`).
5. Subscribe to redis pub/sub: no channels yet (subscribe dynamically per task).
6. Init grammY bot with `TELEGRAM_BOT_TOKEN`. Register handlers.
7. Start long-polling.
8. Install SIGTERM/SIGINT handler: stop polling, drain in-flight, close redis + sqlite, exit 0.

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

1. Load session from redis (`cr:session:{userId}`). If `activeTaskId` is set, reply "A task is already running. Send /stop first." and return.
2. Generate `taskId = crypto.randomUUID()`.
3. Send placeholder Telegram message: "⏳ Working...". Capture `message_id`.
4. Write session hash: `activeTaskId = taskId`, `lastMessageId = message_id`, `updatedAt = now`.
5. Insert tasks row with `status='running'`.
6. Subscribe to `CHANNELS.TASK_PROGRESS(taskId)` and `CHANNELS.TASK_COMPLETE(taskId)` and `CHANNELS.TASK_ERROR(taskId)`.
7. Publish `TaskNewEvent` to `CHANNELS.TASK_NEW`.
8. Start a `TASK_TIMEOUT_MS` timer that publishes a synthetic error event if hit.

### 6.5 Progress updater

Progress events arrive as a stream. The bot MUST batch them to avoid hitting Telegram rate limits (editMessageText is ~1 req/sec per chat; we use 3s default).

1. Maintain an in-memory `ProgressState` per taskId: `{ text: string, tools: string[], lastFlushAt: number }`.
2. On each `ProgressEvent`, append to state but do NOT call `editMessageText` yet.
3. A single interval timer (per task) fires every `PROGRESS_EDIT_INTERVAL_MS`. If state changed since `lastFlushAt`, call `editMessageText` with rendered progress (see 6.6).
4. On task complete or error, cancel the timer.

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
2. Verify `/workspace` is mounted, readable, and is a git repo (`git rev-parse --git-dir`). Exit 1 if not.
3. Install CC hooks: write `~/.claude/settings.json` (section 7.3) referencing `/app/hooks/on-stop.sh`.
4. Start Fastify HTTP server on `127.0.0.1:4711` for hook callbacks (not exposed outside container).
5. Connect to Redis. Subscribe to `CHANNELS.TASK_NEW`.
6. Register SIGTERM: kill any in-flight CC process, drain pending writes, exit 0.

### 7.2 Task execution loop

1. On `TaskNewEvent`, capture git HEAD SHA for diff baseline (`taskStartSha`).
2. Invoke CC SDK (see 7.5) with the prompt and sessionId.
3. For each SDK event, translate to `ProgressEvent` and publish to `CHANNELS.TASK_PROGRESS(taskId)`.
4. Keep a running tally: `accumulatedText`, `toolCalls[]`, `tokensIn`, `tokensOut`.
5. When SDK reports session end (result message): wait up to 5s for the Stop hook HTTP callback to arrive; if it doesn't, synthesize evidence ourselves.
6. Call evidence collector (section 8). Publish `TaskCompleteEvent`.
7. On SDK error or timeout, publish `TaskErrorEvent`.

### 7.3 CC hook configuration

cc-runner writes this to `~/.claude/settings.json` on startup (inside the cc-runner container). Path is `$HOME/.claude/settings.json` which in the container is `/root/.claude/settings.json`.

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/on-stop.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/app/hooks/on-failure.sh",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

### 7.4 Stop hook script

```bash
#!/usr/bin/env bash
# packages/cc-runner/src/hooks/on-stop.sh
# CC pipes a JSON payload on stdin; forward to the local runner HTTP API.
set -euo pipefail
PAYLOAD=$(cat)
curl --max-time 8 -s -X POST \
  -H 'Content-Type: application/json' \
  --data "$PAYLOAD" \
  http://127.0.0.1:4711/hook/stop || true  # never fail CC
```

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

### 8.1 Inputs

- `taskId`
- `taskStartSha` — git HEAD before the task ran
- `lastAssistantText` — final text message from CC
- `tokensIn`, `tokensOut`, `costUsd` from SDK result event
- `durationMs` from wall clock

### 8.2 Diff collection

```bash
# run inside /workspace
git diff --stat <taskStartSha>..HEAD
git diff --numstat <taskStartSha>..HEAD   # for per-file counts
```

If `/workspace` is not clean but had uncommitted changes before task start, use git stash machinery: at task start, `git stash create` to get a baseline tree SHA; diff against that. Record the baseline ref in the task row.

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

## 9. Docker and Deployment

### 9.1 docker-compose.yml (authoritative)

```yaml
services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 2s
      retries: 5

  bot:
    build:
      context: .
      dockerfile: packages/bot/Dockerfile
    restart: unless-stopped
    env_file: .env
    depends_on:
      redis: { condition: service_healthy }
    volumes:
      - cr_data:/data

  cc-runner:
    build:
      context: .
      dockerfile: packages/cc-runner/Dockerfile
    restart: unless-stopped
    env_file: .env
    depends_on:
      redis: { condition: service_healthy }
    volumes:
      - ${WORKSPACE_PATH}:/workspace
      - cr_cc_home:/root/.claude

volumes:
  cr_data:
  cr_cc_home:
```

### 9.2 Dockerfiles

Both Dockerfiles follow the same pattern: multi-stage build, non-root user (where possible), tini as PID 1.

**`packages/bot/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
RUN npm ci --workspaces
RUN npm --workspace=packages/bot run build

FROM node:20-alpine
RUN apk add --no-cache tini
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
RUN addgroup -S cr && adduser -S cr -G cr && chown -R cr:cr /app
USER cr
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/bot/dist/index.js"]
```

**`packages/cc-runner/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/cc-runner ./packages/cc-runner
RUN npm ci --workspaces
RUN npm --workspace=packages/cc-runner run build

FROM node:20-alpine
RUN apk add --no-cache tini git bash curl
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY packages/cc-runner/src/hooks /app/hooks
RUN chmod +x /app/hooks/*.sh
# CC is installed globally so the `claude` binary is available
RUN npm install -g @anthropic-ai/claude-code
# Runs as root because CC writes to $HOME/.claude and owns /workspace mount
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "packages/cc-runner/dist/index.js"]
```

---

## 10. Logging, Observability, Security

### 10.1 Logging

- All logs are structured JSON via pino, one line per event.
- Every log line MUST include: `service` (`bot`|`cc-runner`), `taskId` (when relevant), `userId` (when relevant), `level`.
- NEVER log the full prompt, assistant text, or diff content at info level or above. Truncate to 80 chars for info; full content only at debug.
- NEVER log `TELEGRAM_BOT_TOKEN` or `ANTHROPIC_API_KEY`, even at trace level. Redact via pino redaction config.

### 10.2 Metrics (MVP scope: log-only)

MVP does not ship Prometheus or OpenTelemetry. Instead, these counters are emitted as structured log events at info level, one line each. A later version can plumb them into a real metrics system.

- `task.started` `{ userId, taskId }`
- `task.completed` `{ taskId, durationMs, tokensIn, tokensOut, costUsd, filesChanged }`
- `task.error` `{ taskId, kind }`
- `task.timeout` `{ taskId, durationMs }`

### 10.3 Security requirements

1. Allowlist enforced in middleware BEFORE any other handler. Silent reject. Covered by test SEC-01.
2. Bot token and API key read from env only. `.env` file MUST be in `.gitignore`. Covered by test SEC-02.
3. CC runs with `--permissionMode bypassPermissions` by default for MVP. README MUST warn: *"The bot can run any code on your behalf, including destructive commands. Only run on a project you control, and consider running the stack in a VM if the workspace contains sensitive data."*
4. cc-runner HTTP hook server binds only to `127.0.0.1`. Not exposed in docker-compose ports. Covered by test SEC-03.
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
| AC-03 | Boot order | Bot waits for redis to be healthy before starting long-poll. Verified by compose `depends_on` + healthcheck. |
| AC-04 | Boot order | cc-runner verifies `/workspace` is a git repo; exits 1 if not, with clear error. |

### 11.2 Authentication and security

| ID | Area | Pass condition |
|---|---|---|
| SEC-01 | Allowlist | Message from a non-allowlisted user produces no reply (verified by mock Telegram test; bot sends 0 messages). |
| SEC-02 | Secrets | Grepping the logs directory for `TELEGRAM_BOT_TOKEN` or `ANTHROPIC_API_KEY` after a full e2e run returns zero matches. |
| SEC-03 | Port exposure | `docker compose ps` shows 0 exposed ports on bot and cc-runner; only redis internal port 6379 within compose network. |
| SEC-04 | Rate limit | 31st command within 60s from one user is ignored with a single "rate limited" reply; 32nd in same window gets no reply. |

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
| ERR-01 | Concurrent task | Second text message while a task is running receives reply "A task is already running. Send /stop first." and does NOT spawn a second CC process. |
| ERR-02 | /stop | `/stop` during a running task aborts CC within 5s, edits progress message to "cancelled", marks task row `status='error'`, clears `activeTaskId`. |
| ERR-03 | Timeout | With `TASK_TIMEOUT_MS=10000` and a prompt that induces a long task, the task is killed at 10s +/- 1s and a timeout evidence message is sent. |
| ERR-04 | CC crash | If CC process exits non-zero unexpectedly, a `TaskErrorEvent` `kind='cc_crash'` is published and the user sees an error message within 3s. |
| ERR-05 | Redis disconnect | Redis killed mid-task: bot stops editing progress, auto-reconnects within 30s, subsequent user message gets "Previous task was lost" reply. |
| ERR-06 | Bot restart | Killing and restarting the bot container mid-task marks the in-flight task as error in sqlite on next startup (recovery sweep). |

### 11.5 Quality gates (non-functional)

| ID | Area | Pass condition |
|---|---|---|
| QG-01 | Typecheck | `npm run typecheck` across all packages exits zero. |
| QG-02 | Lint | `npm run lint` (`biome check .`) exits zero. |
| QG-03 | Format | `biome format --write .` produces no changes on a clean tree (idempotent formatting). |
| QG-04 | Unit tests | `vitest run` across all packages exits zero; coverage >= 70% on `packages/bot/src` and `packages/cc-runner/src`. |
| QG-05 | E2E | `scripts/e2e.sh` runs all E2E-* and ERR-* criteria against a real compose stack and exits zero. |
| QG-06 | Build | `docker compose build` completes with no warnings labeled ERROR or FATAL. |
| QG-07 | Image size | bot image under 300MB compressed; cc-runner image under 600MB compressed. |
| QG-08 | Startup time | From `docker compose up` to bot responding to `/start`: under 15s on a warm cache. |

### 11.6 Documentation

| ID | Area | Pass condition |
|---|---|---|
| DOC-01 | README | `README.md` contains: what it is, prerequisites, step-by-step install, `.env` setup, first-run walkthrough, security caveats (the `--skip-permissions` warning verbatim from 10.3.3), troubleshooting pointer. |
| DOC-02 | Ops docs | `docs/operations.md` covers: viewing logs, resetting state (redis + sqlite), backing up sqlite, rotating the bot token. |
| DOC-03 | Deviations | `DEVIATIONS.md` exists and lists every deviation from this spec with one-line justification, or is explicitly empty with a comment stating "no deviations". |

---

## 12. Implementation Order

The agent MUST implement in this order. Do not skip ahead. Each step ends with a committable, runnable state.

### Step 1 — Scaffolding (no behavior)

1. Initialize monorepo: root `package.json` with workspaces, `tsconfig.base.json`, biome config, `.gitignore`, `.editorconfig`, `.env.example`, `DEVIATIONS.md`.
2. Create `packages/shared` with `events.ts` and `channels.ts` (section 5). Export types; no runtime behavior.
3. Create empty `packages/bot` and `packages/cc-runner` with tsconfig extending base, package.json, and an `index.ts` that logs "hello".
4. Write `docker-compose.yml` (section 9.1) and both Dockerfiles (section 9.2).
5. Verify: `docker compose up` brings up all three containers, bot and cc-runner log "hello" and exit.

**Commit:** `chore: scaffold monorepo`

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

## 13. Open Questions (Resolve in Step 1 Before Coding Step 4)

These are known unknowns. The agent MUST answer each in `DEVIATIONS.md` before starting step 4. If the answer invalidates any spec detail, propose the correction.

1. What is the exact exported symbol from `@anthropic-ai/claude-code` for the streaming query API in the version we install? Update 7.5 if different.
2. Does the SDK emit a `session_id` we can persist and later pass to resume, or do we need to track it ourselves by parsing stdout?
3. What are the actual permission-mode option values the SDK accepts (`bypassPermissions`, `acceptEdits`, `default`)? Confirm and update 7.5 + 4.1.
4. Does the Stop hook JSON payload contain a `session_id` we can use to correlate to our `taskId`, or do we need to set an env var before invoking CC and read it in the hook?
5. What is the exact rate limit Telegram imposes on `editMessageText` for our usage pattern? Confirm 3000ms default is safe, or adjust `PROGRESS_EDIT_INTERVAL_MS` default.

---

## 14. Change Management

- This document is version 1.0. Any change to this spec bumps the minor version and is dated.
- Implementation deviations go in `DEVIATIONS.md`, not here.
- Scope creep is rejected by default. Any feature not in section 1.1 MUST be deferred to V1 or later.
- If the agent believes a requirement is wrong, it MUST stop, write the concern in `DEVIATIONS.md`, and wait for human confirmation before deviating.
