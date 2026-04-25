# ClaudeRemote — MVP

Remote control Claude Code via Telegram. Send prompts from your phone, receive streaming progress and structured evidence bundles.

**Status:** MVP (Minimum Viable Product)  
**Latest Release:** v0.1.0-mvp

---

## What It Does

ClaudeRemote is a Telegram bot that wraps Claude Code, allowing you to:

1. Send a natural-language prompt via Telegram message
2. Watch real-time progress (tool calls, text output) edit into a single message
3. Receive a formatted evidence bundle showing what changed: diffs, test results, token costs
4. Maintain session continuity: subsequent messages continue the same CC session with full context

---

## Requirements

- Docker & Docker Compose (for containerized services)
- Node.js 20+ (to build the images)
- Telegram Bot Token (create via @BotFather)
- Claude Pro or Max subscription (for authentication via `claude login`)
- Project Directory (absolute path to a git repository you own)

---

## Quick Start

### 1. Clone and configure

```bash
git clone <this-repo> claude-remote
cd claude-remote
cp .env.example .env
```

### 2. Fill .env

```env
TELEGRAM_BOT_TOKEN=<bot_token>
ALLOWLIST=<your-user-id>
WORKSPACE_PATH=/absolute/path/to/your/project
```

To find your Telegram user ID: Message @userinfobot.

WORKSPACE_PATH must:
- Be an absolute filesystem path
- Point to an existing git repository
- Be readable and writable by Docker

### 3. Authenticate with Claude (first time only)

Run the interactive login to store your Claude Pro/Max credentials:

```bash
docker compose run --rm cc-runner claude login
```

This launches the Claude login flow. Sign in with your Claude account, and credentials are saved to a Docker volume (`cr_cc_home`) that persists across restarts. You only need to do this once.

### 4. Start the stack

```bash
docker compose up
```

### 5. Send a message

Message the bot on Telegram:
```
/start
```

Then send any text prompt:
```
Write a Python function that reverses a list
```

---

## Commands

- `/start` — Initialize session
- `/help` — Show command list
- `/status` — Show current session info
- `/stop` — Cancel the running task
- `/new` — Clear session, start fresh

---

## Security

⚠️ **Important:** The bot can run any code on your behalf, including destructive commands. Only run on a project you control, and consider running the stack in a VM if the workspace contains sensitive data.

**Additional safeguards:**
- Only allowlist Telegram user IDs you trust
- Review the evidence bundle output (shows full diffs)
- Use rate limiting (30 commands per minute, 1 task at a time)

---

## Configuration

See `.env.example` for all options.

| Variable | Default | Purpose |
|----------|---------|---------|
| TELEGRAM_BOT_TOKEN | (required) | Bot authentication |
| ALLOWLIST | (required) | Comma-separated user IDs |
| WORKSPACE_PATH | (required) | Project directory |
| REDIS_URL | redis://redis:6379 | Redis pub/sub |
| SQLITE_PATH | /data/claude-remote.db | Task history |
| PROGRESS_EDIT_INTERVAL_MS | 3000 | Progress update interval (min 1500) |
| TASK_TIMEOUT_MS | 1800000 | Task timeout (30 min default) |
| CC_SKIP_PERMISSIONS | true | Use bypassPermissions mode |

---

## Troubleshooting

**Bot doesn't respond:**
- Check logs: `docker compose logs bot`
- Verify token: Copy carefully from @BotFather
- Verify allowlist: Confirm your user ID

**Task never completes:**
- Check timeout: Default is 30 min
- Verify WORKSPACE_PATH: Must exist and be a git repo
- Check logs: `docker compose logs cc-runner`

**"A task is already running":**
- Send `/stop` first, then retry

---

## See Also

- `docs/operations.md` — Logging, backups, debugging
- `docs/troubleshooting.md` — Common issues and fixes
- `SPEC.md` — Full technical specification
- `DEVIATIONS.md` — Implementation notes

---

## Architecture

The stack consists of:
- **bot** (Node.js): Telegram long-poll, session management, task orchestration
- **cc-runner** (Node.js): Claude Code SDK wrapper, progress streaming, evidence collection
- **redis** (service): Pub/sub for inter-service communication, session state
- **sqlite** (file): Task history and recovery

---

## License

[Your license here]
