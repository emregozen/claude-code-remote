# ClaudeRemote

Mobile-first remote control for Claude Code via Telegram. Run Claude Code tasks from your phone or desktop and receive streamed progress updates.

## What it does

- Send text prompts to Claude Code via Telegram
- Receive real-time progress updates as tasks run
- Get structured evidence bundles with diffs, test results, and summaries
- Maintain persistent sessions across messages
- Run on your local machine without Docker or containers

## Prerequisites

- **Node.js 20.x LTS** — install from https://nodejs.org/
- **Git** — required for workspace diff collection and session management
- **Claude Code CLI** authenticated on your machine
  ```bash
  which claude  # verify installation
  claude login  # authenticate with your Claude Pro/Max account
  claude --version  # verify authentication
  ```
- **Telegram bot token** from @BotFather
- **Your Telegram numeric user ID** (use @userinfobot)
- **Absolute path** to a local git repository to work with

## Security & Permissions

⚠️ **IMPORTANT: The bot can run any code on your behalf, including destructive commands like `rm -rf`. Only run ClaudeRemote on a project you control. Consider running this on a dedicated machine or VM if the workspace contains sensitive data or code.**

The bot supports three approval modes (set with `/mode`):

| Mode | Behavior |
|---|---|
| `bypass` | All tools run without prompts (`bypassPermissions`) |
| `safe` | File edits auto-approved, Bash and other tools denied (`acceptEdits`) |
| `strict` | All tools require explicit Claude Code permission (`default`) |

In non-interactive mode, denied tools are reported back as blocked operations in the task summary.

## Installation

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

3. Create `.env` from the example:
   ```bash
   cp .env.example .env
   ```

4. Edit `.env` with your configuration:
   ```
   TELEGRAM_BOT_TOKEN=<your_bot_token_from_@BotFather>
   ALLOWLIST=<your_telegram_user_id>
   WORKSPACE_PATH=/absolute/path/to/your/git/repo
   ```

## Running

### Foreground (for testing):
```bash
npm start
```

Logs appear in your terminal. Press Ctrl+C to stop.

### Background (production):

**Using systemd user service:**
```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/claude-remote.service << 'EOF'
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
EOF

systemctl --user enable claude-remote
systemctl --user start claude-remote
journalctl --user -f -u claude-remote  # view logs
```

**Using pm2:**
```bash
npm install -g pm2
pm2 start dist/index.js --name claude-remote
pm2 startup
pm2 save
```

## Configuration

All configuration is via `.env`. See `.env.example` for all options:

| Variable | Required | Default | Notes |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | yes | — | From @BotFather |
| `ALLOWLIST` | yes | — | Comma-separated Telegram user IDs |
| `WORKSPACE_PATH` | yes | — | Absolute path to git repo |
| `SQLITE_PATH` | no | `./data/claude-remote.db` | Task history database |
| `LOG_LEVEL` | no | `info` | `trace`, `debug`, `info`, `warn`, `error` |
| `PROGRESS_EDIT_INTERVAL_MS` | no | `3000` | Min 1500ms (Telegram rate limit) |
| `TASK_TIMEOUT_MS` | no | `1800000` | 30 min default |

## Commands

| Command | Action |
|---|---|
| `/start` | Initialize a new session |
| `/help` | Show help and command list |
| `/status` | Show current session status |
| `/mode` | View or change approval mode (`bypass` / `safe` / `strict`) |
| `/model` | View or change Claude model |
| `/effort` | View or set effort level |
| `/budget` | View or set per-task USD budget limit |
| `/stop` | Cancel the running task |
| `/new` | Clear session and start fresh |
| `/claude` | Manage Claude Code sessions |
| *text message* | Send a prompt to Claude Code |

## How it works

1. You send a text message to the bot
2. Bot creates a task and calls Claude Code SDK
3. Progress updates stream back and edit a single "Working..." message
4. When done, bot posts an evidence bundle with:
   - Summary of changes made
   - Git diff (files changed, +/- counts)
   - Test results (if tests were run)
   - Token usage and duration
5. Session is persisted so follow-up prompts have context

## Data & Logs

- **SQLite database**: `./data/claude-remote.db` (created automatically)
  - Stores task history, prompts, and results
  - Reset with: `rm ./data/claude-remote.db` (careful!)
- **Logs**: stdout in foreground, `journalctl` if using systemd
  - All logs are structured JSON for easy parsing

## Troubleshooting

**"Claude CLI not found or not authenticated"**
- Run `claude login` on the host
- Verify with `claude --version`
- Make sure you're using the same user account

**"Task timed out"**
- Increase `TASK_TIMEOUT_MS` in `.env`
- Check if the task is actually stuck (review terminal output)

**"A task is already running"**
- Send `/stop` to cancel the current task
- Use `/new` to clear the session entirely

**Database is locked**
- Stop the process: `systemctl --user stop claude-remote` or press Ctrl+C
- Delete the lock file: `rm ./data/claude-remote.db-wal`
- Start again

## Development

```bash
npm run dev        # Run with tsx (hot reload)
npm run build      # TypeScript → JavaScript
npm run typecheck  # Type checking
npm run lint       # Linting with Biome
npm run format     # Auto-format
npm run test       # Unit tests (vitest)
```

## Architecture

Single Node.js process containing:
- **Bot**: grammY framework, Telegram long-polling, command handlers
- **Runner**: Claude Code SDK wrapper, progress event streaming
- **Store**: SQLite3 for persistent task history, in-memory Map for sessions
No external services required (no Redis, no separate containers).

## License

MIT

---

For detailed technical specs, see `SPEC.md`.
