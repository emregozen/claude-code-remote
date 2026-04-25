# Operations Guide

## Viewing Logs

### Foreground (during `npm start`)
Logs print to stdout in structured JSON format via Pino.

### Background (systemd)
```bash
journalctl --user -f -u claude-remote
journalctl --user -n 100 -u claude-remote  # last 100 lines
```

### Background (pm2)
```bash
pm2 logs claude-remote
pm2 logs claude-remote --lines 100
```

## Resetting State

**Delete task history:**
```bash
rm ./data/claude-remote.db
rm ./data/claude-remote.db-wal  # remove lock file if database is locked
```

**Clear a user's session:**
Stop the process and edit the SQLite database (requires sqlite3 CLI):
```bash
sqlite3 ./data/claude-remote.db "DELETE FROM tasks WHERE user_id = 123456789;"
```

## Re-authenticating Claude Code

If Claude Code credentials expire or need to be refreshed:

```bash
claude login
```

Then restart ClaudeRemote. The new credentials will be picked up automatically.

## Verifying Hook Server

The hook HTTP server binds to `127.0.0.1:4711` (default) and should NOT be exposed to the internet.

Verify it's running and bound correctly:
```bash
netstat -tnlp | grep 4711
# or on systems without netstat:
ss -tnlp | grep 4711
```

Expected output shows `127.0.0.1:4711` (NOT `0.0.0.0:4711`):
```
tcp  0  0  127.0.0.1:4711  0.0.0.0:*  LISTEN  <pid>/node
```

## Recovering from Settings.json Issues

ClaudeRemote modifies `~/.claude/settings.json` on startup to register the Stop hook, and restores it on graceful shutdown.

If the process crashes ungracefully:

1. Check for the backup:
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

4. If restoration failed, manually edit `~/.claude/settings.json` to remove the Stop hook we added.

## Rotating Bot Token

If you need to rotate your Telegram bot token:

1. Create a new bot with @BotFather
2. Update `.env` with the new token:
   ```
   TELEGRAM_BOT_TOKEN=<new_token>
   ```
3. Restart ClaudeRemote:
   ```bash
   systemctl --user restart claude-remote
   # or if using pm2:
   pm2 restart claude-remote
   ```

The old bot token will stop working, and new messages will arrive via the new token.

## Monitoring Disk Usage

Task history is stored in SQLite. Check database size:
```bash
du -h ./data/claude-remote.db
```

To reduce size, delete old completed tasks:
```bash
sqlite3 ./data/claude-remote.db "DELETE FROM tasks WHERE status = 'complete' AND started_at < datetime('now', '-30 days');"
```

## Backup

To back up task history:
```bash
cp ./data/claude-remote.db ./data/claude-remote.db.backup.$(date +%Y%m%d-%H%M%S)
```

Restore from a backup:
```bash
cp ./data/claude-remote.db.backup.20240101-120000 ./data/claude-remote.db
```

## Performance Tuning

### Increase progress update frequency
Lower `PROGRESS_EDIT_INTERVAL_MS` (minimum 1500ms):
```
PROGRESS_EDIT_INTERVAL_MS=1500
```

### Increase task timeout
If tasks are timing out prematurely, increase `TASK_TIMEOUT_MS`:
```
TASK_TIMEOUT_MS=3600000  # 1 hour
```

### Adjust log verbosity
Change `LOG_LEVEL` for more/less output:
```
LOG_LEVEL=debug  # very verbose
LOG_LEVEL=warn   # only warnings and errors
```

## Troubleshooting

### "Cannot find module '@anthropic-ai/claude-code'"
The SDK dependency is missing. Reinstall:
```bash
npm install
npm run build
```

### "EADDRINUSE: address already in use :::4711"
The hook server port is already bound. Either:
- Kill the process using it: `lsof -i :4711`
- Use a different port: set `HOOK_HTTP_PORT=4712`

### SQLite "database is locked"
The database is being written to by another process. Stop ClaudeRemote:
```bash
systemctl --user stop claude-remote
```

Then remove the lock file:
```bash
rm ./data/claude-remote.db-wal
```

And restart.

### Bot not responding to messages
1. Verify `TELEGRAM_BOT_TOKEN` is correct: send `/help` via Telegram
2. Verify `ALLOWLIST` includes your user ID: use @userinfobot in Telegram
3. Check logs for errors: `journalctl --user -f -u claude-remote`
