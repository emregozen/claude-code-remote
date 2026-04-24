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

3. **Network**: Can the bot reach Telegram API?
   - Check: `docker compose logs bot | tail -20`
   - Look for connection errors in logs

4. **Redis**: Is Redis running?
   - Check: `docker compose ps`
   - Should show `redis: Up`

## Task never completes or times out

**Symptom:** A task runs, shows progress, but never finishes or shows timeout.

**Check:**
1. **Task timeout**: Is `TASK_TIMEOUT_MS` set appropriately?
   - Default is 30 minutes (1800000 ms)
   - For longer-running tasks, increase this value in `.env`
   - Restart the bot after changing

2. **Claude Code**: Is Claude Code SDK installed?
   - Check: `docker compose exec cc-runner which claude`
   - Should output the path to the claude binary

3. **Workspace**: Is the workspace path mounted and is it a git repo?
   - Check: `docker compose exec cc-runner test -d /workspace/.git && echo "OK"`
   - Workspace must be a git repository for the bot to function

4. **Logs**: Check the runner logs for errors
   - Check: `docker compose logs cc-runner | tail -50`
   - Look for stack traces or error messages

## "A task is already running" error

**Symptom:** Sending a message when a task is running shows this error.

**Fix:**
- Wait for the current task to complete, OR
- Send `/stop` to abort the current task and free up the session

## Changes are not as expected

**Symptom:** Task completes with evidence showing changes, but the files don't match the evidence.

**Check:**
1. **Workspace state**: Did your workspace have uncommitted changes?
   - The bot diffs against the git HEAD, not the working tree
   - Commit or stash changes before running tasks

2. **Evidence accuracy**: Review the evidence bundle
   - Click the evidence message for full details
   - Check the diff counts and file names
   - If evidence looks wrong, verify your workspace manually

## "The bot can run any code" warning

**Note:** This is expected security behavior.

The bot runs with `CC_SKIP_PERMISSIONS=true`, meaning Claude Code will not ask for permission before running commands. This is suitable for:
- Development environments
- Project directories you control
- Workspaces without sensitive data

**For sensitive data:**
- Run the stack in a VM or container
- Limit file access using git's `sparse-checkout`
- Use `CC_SKIP_PERMISSIONS=false` in `.env` (requires manual approval in the bot)

## Docker compose fails to start

**Symptom:** `docker compose up` exits immediately or hangs.

**Check:**
1. **Port conflicts**: Are ports 6379 (redis) in use?
   - Check: `lsof -i :6379`
   - Stop conflicting services or use different ports in `docker-compose.yml`

2. **Docker build errors**: Do images fail to build?
   - Check: `docker compose build --no-cache`
   - Look for base image issues or missing dependencies

3. **Disk space**: Do you have enough disk space?
   - Check: `docker system df`
   - Free space if needed and retry

4. **Permissions**: Can you run docker without `sudo`?
   - Check: `docker ps`
   - If denied, add your user to the docker group

## "Redis killed mid-task" or connection lost

**Symptom:** Task abruptly stops, progress updates cease.

**Expected behavior (ERR-05):** 
- The bot auto-reconnects to Redis within 30 seconds
- Send a new message to retry

**To recover:**
1. Wait 30 seconds
2. Send a new message (this will check the connection)
3. If the task was lost, the previous task row shows `status='error'` in sqlite

**Prevent:**
- Use named volumes for Redis persistence (see `docker-compose.yml`)
- Monitor Redis health: `docker compose exec redis redis-cli info`

## "Log file not found" or no logs

**Check:**
1. **Logging setup**: Are logs going to stdout/stderr?
   - Check: `docker compose logs bot`
   - If empty, the app may not be logging structured output

2. **Log level**: Is `LOG_LEVEL` set to capture what you need?
   - Default is `info`
   - For debugging: `LOG_LEVEL=debug` in `.env`
   - Restart the bot after changing

3. **Docker logs**: Can you read container logs?
   - Check: `docker compose logs -f bot`
   - Should show real-time logs

## Task marked as error but shouldn't be

**Common cause (ERR-06):** Bot crashed and restarted.
- When the bot restarts, it marks all running tasks as error with kind `internal`, message `bot restart`
- This is expected recovery behavior

**To verify:**
- Check sqlite: `sqlite3 /path/to/db "SELECT * FROM tasks WHERE status='error' LIMIT 1;"`
- Look at `error_json` column for `kind` and `message`

## Redis data lost after restart

**Symptom:** Session IDs not persisting across bot restarts.

**Check:**
1. **Session data**: Is session data in Redis or lost?
   - Check: `docker-compose exec redis redis-cli KEYS "cr:session:*" | wc -l`
   - If 0, sessions were lost

2. **Redis persistence**: Is Redis saving to disk?
   - Check `docker-compose.yml` for volume mount
   - If not mounted, sessions are ephemeral

3. **Recovery**: After restart, send `/new` to clear stale sessions
   - This clears in-memory state and prevents conflicts

## Image build is very slow

**Cause:** npm CI is downloading all dependencies.

**Options:**
1. **Use a cache volume** (recommended for local development):
   ```bash
   docker compose build --cache-from
   ```

2. **Pre-build layers locally**:
   - This speeds up subsequent builds

## Port already in use

**Symptom:** `docker compose up` fails with "port already in use".

**Fix:**
1. Find what's using the port:
   ```bash
   lsof -i :6379  # for Redis on port 6379
   ```

2. Stop the conflicting service or use a different port in `docker-compose.yml`

## Still stuck?

1. **Check the logs**: `docker compose logs -f`
2. **Verify prerequisites**: `docker --version`, `docker-compose --version`, `jq --version`
3. **Restart everything**: `docker compose down -v && docker compose up`
4. **Review SPEC.md**: Architecture and detailed behavior in the project spec
5. **Check docs/operations.md**: For operational guidance on data recovery, monitoring, etc.
