# Troubleshooting

## Bot doesn't respond to messages

**Symptom:** Messages sent to the bot receive no reply.

**Check:**
1. **Allowlist**: Is your user ID in `ALLOWLIST` in the `.env` file?
   - Get your Telegram user ID: send `/start` to `@userinfobot` on Telegram
   - Check `.env`: `ALLOWLIST=your_user_id`
   - Restart the bot after changing

2. **Bot token**: Is `TELEGRAM_BOT_TOKEN` valid?
   - Get a new token from `@BotFather` on Telegram if expired
   - Update `.env` with the new token
   - Restart the bot

3. **Process running**: Is the bot process running?
   - Check: `ps aux | grep "node dist/index.js"` or `ps aux | grep claude-remote`
   - If using systemd: `systemctl --user status claude-remote`
   - If using pm2: `pm2 status`

4. **Claude Code installed**: Is Claude Code installed and authenticated?
   - Check: `which claude`
   - Check: `claude --version`
   - If not authenticated, run: `claude login`

## Task never completes or times out

**Symptom:** A task runs, shows progress, but never finishes or shows timeout.

**Check:**
1. **Task timeout**: Is `TASK_TIMEOUT_MS` set appropriately?
   - Default is 30 minutes (1800000 ms)
   - For longer-running tasks, increase this value in `.env`
   - Restart the bot after changing

2. **Workspace**: Is the workspace path valid?
   - Check: `test -d $WORKSPACE_PATH && echo "exists"` (replace `$WORKSPACE_PATH` with your path)
   - Check if it's a git repo: `git -C $WORKSPACE_PATH rev-parse --git-dir`

3. **Claude Code subprocess**: Check if the subprocess is hanging
   - Look for long-running `claude` processes: `ps aux | grep claude`
   - May indicate a stuck subprocess waiting for input

4. **Logs**: Check the bot logs for errors
   - Foreground: look at terminal output
   - Systemd: `journalctl --user -f -u claude-remote`
   - pm2: `pm2 logs claude-remote`

## "A task is already running" error

**Symptom:** Sending a message when a task is running shows this error.

**Fix:**
- Wait for the current task to complete, OR
- Send `/stop` to abort the current task and free up the session
- Send `/new` to clear the session entirely

## Claude CLI not found or not authenticated

**Symptom:** Process exits immediately with "Claude not found" or "not authenticated" message.

**Fix:**
1. Verify Claude Code is installed:
   ```bash
   which claude
   ```

2. Authenticate if not already done:
   ```bash
   claude login
   ```

3. Verify authentication:
   ```bash
   claude --version
   ```

4. Restart ClaudeRemote

## Settings.json was modified and not restored

**Symptom:** `~/.claude/settings.json` contains ClaudeRemote's hooks after a crash.

**Fix:**
1. Check if backup exists:
   ```bash
   ls ~/.claude/settings.json.backup.cr
   ```

2. If it exists, restore it:
   ```bash
   cp ~/.claude/settings.json.backup.cr ~/.claude/settings.json
   ```

3. Verify the file is valid JSON:
   ```bash
   cat ~/.claude/settings.json | jq .
   ```

4. If you manually removed the hooks, no further action needed

## Hook server port already in use

**Symptom:** Process exits with "EADDRINUSE: address already in use :::4711".

**Fix:**
1. Find what's using the port:
   ```bash
   lsof -i :4711
   ```

2. Either:
   - Stop the process using it, OR
   - Change the port in `.env`: `HOOK_HTTP_PORT=4712`

3. Restart ClaudeRemote

## SQLite "database is locked"

**Symptom:** Tasks fail with "database is locked" error, or bot won't start.

**Fix:**
1. Stop the ClaudeRemote process:
   ```bash
   systemctl --user stop claude-remote
   # or if using pm2:
   pm2 stop claude-remote
   # or press Ctrl+C if running in foreground
   ```

2. Remove the lock file:
   ```bash
   rm ./data/claude-remote.db-wal
   rm ./data/claude-remote.db-shm  # if it exists
   ```

3. Restart ClaudeRemote:
   ```bash
   systemctl --user start claude-remote
   # or pm2 start, or npm start
   ```

## Process restart marks tasks as error

**Symptom:** After restarting the bot, some tasks show `status='error'` in the database.

**Expected behavior:** This is normal recovery. When the bot restarts, all `running` tasks are marked as error to prevent orphaned tasks. This is ERR-06 expected behavior.

**To check:**
```bash
sqlite3 ./data/claude-remote.db "SELECT * FROM tasks WHERE status='error' LIMIT 5;"
```

## Changes not as expected

**Symptom:** Task completes with evidence showing changes, but workspace doesn't reflect them.

**Check:**
1. **Workspace state**: Did your workspace have uncommitted changes?
   - The bot diffs against `git HEAD`, not the working tree
   - Commit or stash changes before running tasks
   - Verify with: `git status`

2. **Evidence accuracy**: Review the evidence bundle in Telegram
   - Check the diff counts and file names
   - Verify against your actual workspace

3. **Session state**: Is your session persisted correctly?
   - Send `/status` to see your session ID
   - Session allows context across messages

## Can't authenticate with Claude Code

**Symptom:** "Claude CLI not found" or credential errors at startup.

**Fix:**
1. Ensure Claude Code is installed:
   ```bash
   npm list -g @anthropic-ai/claude-code
   # or which claude
   ```

2. Authenticate:
   ```bash
   claude login
   ```

3. Test authentication:
   ```bash
   claude --version
   claude  # interactive test
   ```

4. Ensure ClaudeRemote is running as the same user who authenticated

## Logs not showing anything

**Check:**
1. **Log level**: Is `LOG_LEVEL` set appropriately?
   - Default is `info`
   - For debugging: `LOG_LEVEL=debug` in `.env`
   - Restart after changing

2. **Output redirection**: Logs go to stdout
   - If running in foreground: should see logs in terminal
   - If using systemd: `journalctl --user -f -u claude-remote`
   - If using pm2: `pm2 logs claude-remote`

3. **Startup errors**: Check if the process exits immediately
   - Run in foreground with `npm start` to see errors

## Still stuck?

1. **Collect context**:
   - Copy your `.env` (redact `TELEGRAM_BOT_TOKEN`)
   - Get recent logs: `journalctl --user -n 50 -u claude-remote` or terminal output
   - Check `git status` in your workspace

2. **Check the spec**: See `SPEC.md` Section 1 for architecture overview

3. **Review operations guide**: See `docs/operations.md` for standard operations like backups, log viewing, and port verification
