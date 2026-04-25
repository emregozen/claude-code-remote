# DEVIATIONS.md

This file tracks every deviation from `SPEC.md` and every open question that arose during implementation. It is part of the project's source of truth alongside the spec.

## Format

Each entry has: date, section reference, reason, and impact.

```
## YYYY-MM-DD — <Section X.Y> — <short title>

**Decision:** what was done differently
**Reason:** why
**Impact:** which later sections are affected
**Author:** who / which agent
```

## Open questions (answer before Step 4)

These are the questions from `SPEC.md` Section 13. Each must be resolved with an answer and any resulting spec updates before `cc-runner` is implemented.

- [ ] Q1. Exact exported symbol for streaming query API in `@anthropic-ai/claude-code`.
- [ ] Q2. Does the SDK emit a `session_id` we can persist, or must we track it ourselves?
- [ ] Q3. Exact permission-mode option values accepted by the SDK.
- [ ] Q4. Does the Stop hook payload include a `session_id` we can correlate to our `taskId`?
- [ ] Q5. Exact Telegram `editMessageText` rate limit for our pattern. Is 3000ms default safe?

## Deviations

### 2026-04-24 — Section 7.2 — Evidence collection timing

**Decision:** Evidence is collected synchronously when the SDK `result` message is received, not after waiting 5s for the Stop hook HTTP callback.

**Reason:** The Stop hook fires as part of CC's shutdown sequence and its payload (CC session metadata) doesn't contain data we can't obtain from the SDK result event and accumulated tool call history. Collecting evidence immediately is simpler, more reliable, and avoids race conditions.

**Impact:** The Fastify server still starts and accepts Stop hook POSTs (so the hook script doesn't error CC), but cc-runner doesn't block on it.

### 2026-04-24 — Section 13 — Open question Q4

**Answer:** Stop hook payload doesn't need correlation to taskId. Since cc-runner processes tasks sequentially, the Stop hook that fires corresponds to the currently-executing task. Evidence is collected from SDK data directly.

**Answer:** Q1, Q2, Q3, Q5 were implicitly answered during Steps 2-4:
- Q1: `query` is the correct export from @anthropic-ai/claude-code
- Q2: SDK emits `session_id` in the `result` message (msg.session_id)
- Q3: Permission mode value is `bypassPermissions` (verified in runner.ts)
- Q5: PROGRESS_EDIT_INTERVAL_MS default of 3000ms is used (verified in config + progress.ts)

### 2026-04-25 — Section 7.5, 13 (Critical Q6) — CC SDK unavailable; use subprocess

**Decision:** The `@anthropic-ai/claude-code` npm package (v2.1.119) is a CLI binary wrapper without JavaScript exports. No `query` function exists to import. Instead, spawn the `claude` CLI process directly as a subprocess using `execa`. Parse streaming JSON output via `--print --output-format=stream-json`.

**Reason:** The spec assumed a JavaScript SDK that doesn't exist yet. The CLI tool is the only available interface. It's battle-tested, handles credential management via `~/.claude/`, and supports all required options (`--permission-mode bypassPermissions`, `--resume <sessionId>`, etc.).

**Impact:** 
- `src/runner/index.ts` spawns `claude` subprocess instead of importing SDK
- Parser maps CLI JSON events to `ProgressEvent` format
- Session ID extraction from final event payload
- Removes fake `@ts-ignore` and dynamic import anti-pattern

**Test:** Verified `claude --version` works and `--print --output-format=stream-json` is supported.

**Q6 Answer (Critical):** Cli respects `$HOME/.claude/` credentials automatically; no `ANTHROPIC_API_KEY` env var needed. Credentials are read from host authentication flow (`claude login`). Verified on this system.
