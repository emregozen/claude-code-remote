# Operations Guide

How to run, maintain, and debug ClaudeRemote in production.

---

## Logs

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f bot
docker compose logs -f cc-runner
docker compose logs -f redis

# Last 100 lines
docker compose logs --tail=100 bot
```

Logs are structured JSON (pino format). Example:

```json
{"level":20,"time":"2026-04-25T00:10:51.123Z","service":"bot","prompt":"add login endpoint","taskId":"abc-def-123"}
```

### Log levels

Control via `LOG_LEVEL` env var:
- `trace` — Everything (very noisy)
- `debug` — Development details
- `info` — Key milestones (default)
- `warn` — Warnings only
- `error` — Errors only

---

## Data & Recovery

### SQLite database

Task history stored in `/data/claude-remote.db` (inside container, mapped to host volume).

**Backup:**
```bash
# Copy the database file
docker compose exec bot cp /data/claude-remote.db /tmp/backup-$(date +%s).db
docker compose cp <container>:/tmp/backup-*.db .
```

**Recovery:**
If the database is corrupted:
```bash
# Stop the stack
docker compose down

# Delete the corrupted database
rm /data/claude-remote.db

# Start again (bot will recreate empty database)
docker compose up
```

Tasks will be marked as "error" on next bot startup (recovery sweep).

### Redis data

Session state and pub/sub messages are ephemeral. On restart, users must resend prompts.

**If Redis is lost:**
```bash
docker compose down
docker volume rm claude-remote_redis_data  # if persistent volume exists
docker compose up
```

---

## Monitoring

### Check service health

```bash
# Is bot listening?
docker compose logs bot | grep "Bot initialized"

# Is redis healthy?
docker compose logs redis | grep "ready to accept"

# Is cc-runner ready?
docker compose logs cc-runner | grep "listening for tasks"
```

### Check performance

Watch real-time logs and look for:
- Timeout messages (`Task exceeded timeout`)
- Crash messages (`Claude Code crashed`)
- High token usage (`tokensIn`, `tokensOutput` in evidence bundles)

---

## Stopping & Restarting

### Graceful shutdown

```bash
# Bot and cc-runner will receive SIGTERM
# In-flight tasks are marked as "error" in sqlite
docker compose down
```

### Quick restart (reload code)

```bash
docker compose restart
```

---

## Updating

### Pull latest code

```bash
git pull origin main
```

### Rebuild images

```bash
docker compose build --no-cache
docker compose up
```

### Update dependencies

```bash
npm update
npm run build
docker compose build --no-cache
docker compose up
```

### Rotate the bot token

When you rotate your bot token at @BotFather:

1. Stop the bot:
   ```bash
   docker compose stop bot
   ```

2. Update `.env`:
   ```bash
   TELEGRAM_BOT_TOKEN=<new-token-from-BotFather>
   ```

3. Restart:
   ```bash
   docker compose up -d
   ```

Old token becomes invalid immediately. Existing sessions are not affected (stored in Redis/SQLite independently of the token).

---

## Troubleshooting

### High memory usage

- Check if a task is stuck: `docker compose logs cc-runner`
- Restart the stack: `docker compose restart`
- Check `TASK_TIMEOUT_MS` — reduce if tasks are getting too large

### Redis connectivity issues

```bash
docker compose logs redis
docker compose restart redis
```

### Bot token invalid

Ensure `TELEGRAM_BOT_TOKEN` in `.env` is copied exactly from @BotFather (no spaces).

### Workspace mounting issues

Verify `WORKSPACE_PATH` exists and is readable:
```bash
ls -la $WORKSPACE_PATH
git -C $WORKSPACE_PATH rev-parse --git-dir  # confirm it's a git repo
```

---

## Upgrading

Before upgrading:
1. Back up `/data/claude-remote.db`
2. Test on a staging environment first
3. Plan for a brief downtime

Steps:
```bash
docker compose down
git pull origin main
docker compose build
docker compose up
```

---

## Cleanup

### Remove old images

```bash
docker system prune -a
```

### Remove all data (reset state)

```bash
docker compose down -v
rm /data/claude-remote.db
docker compose up
```

---

## Metrics

The bot emits structured log events for metrics:

```json
{"level":20,"type":"task.started","taskId":"...","userId":123}
{"level":20,"type":"task.completed","taskId":"...","durationMs":5000,"tokensIn":1000,"tokensOut":500,"costUsd":0.001}
{"level":20,"type":"task.timeout","taskId":"...","durationMs":30000}
{"level":20,"type":"task.error","taskId":"...","kind":"cc_crash"}
```

Parse these logs to build dashboards or alerts (e.g., via ELK, Prometheus, DataDog).
