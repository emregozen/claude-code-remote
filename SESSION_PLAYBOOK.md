# SESSION_PLAYBOOK.md

How to run each build session with Claude Code (or any AI coding agent).

This file is for **you** (the human), not the agent. Keep it next to the repo. Use it as a checklist when you start, run, and end each session.

---

## Before you start (one-time setup)

1. Create the repo and push `SPEC.md`, `CLAUDE.md`, `DEVIATIONS.md`, `README.md`, `.env.example`, `.gitignore` to the root.
2. Make sure Claude Code (or whichever agent) is configured to auto-read `CLAUDE.md`. With Claude Code this happens automatically; with others you may need to instruct it manually.
3. Decide where this project will eventually run (the always-on machine). You don't need it for session 1, but by session 5 you'll want `docker compose up` to work somewhere.

---

## Session opening prompt template

Paste this at the start of every session. Fill in the bracketed bits.

```
We're working on ClaudeRemote — spec in SPEC.md, rules in CLAUDE.md.

Before writing any code:
1. Read SPEC.md in full.
2. Read CLAUDE.md and DEVIATIONS.md.
3. Check the latest commits with `git log --oneline -20`.
4. Tell me which step in SPEC.md §12 you think comes next, and which
   acceptance criteria that step targets.

Wait for my confirmation before writing code.

Scope for this session: [STEP N only]. Do not chain steps.
```

The "wait for confirmation" line is important. It's cheap to get wrong on the first attempt, expensive to get wrong once code is being written.

---

## Per-session checklist

### Session 0 — Resolve open questions (pre-Step 4)

**Goal:** fill in Q1–Q5 in `DEVIATIONS.md`.
**Do:**
- Ask the agent to investigate `@anthropic-ai/claude-code` (read its docs, its published types, recent changelog).
- For each open question, the agent writes an answer in `DEVIATIONS.md`.
- If an answer contradicts `SPEC.md`, the agent proposes a spec edit. You approve or reject.
- Commit: `docs: resolve SPEC §13 open questions`

### Session 1 — Step 1 (Scaffolding)

**Target commit:** `chore: scaffold monorepo`
**Verify before commit:** `docker compose up` runs all three containers; bot and cc-runner log "hello" and exit cleanly.

### Session 2 — Step 2 (Config + Redis)

**Target commit:** `feat: config validation and redis wiring`
**Acceptance criteria:** AC-01, AC-02, AC-03
**Verify before commit:** missing `TELEGRAM_BOT_TOKEN` produces a clear error within 2s. Bot waits for redis healthcheck before polling.

### Session 3 — Step 3 (Bot skeleton)

**Target commit:** `feat: bot auth and commands (SEC-01, SEC-04)`
**Acceptance criteria:** SEC-01, SEC-04
**Verify before commit:** non-allowlisted user gets no reply. Rate limit kicks in at the 31st message.

### Session 4 — Step 4 (Task pipeline)

**Target commit:** `feat: task pipeline with streaming progress (E2E-02)`
**Acceptance criteria:** E2E-02 partial
**Verify before commit:** sending a prompt triggers cc-runner; progress updates arrive in Telegram with the correct throttling.

### Session 5 — Step 5 (Evidence collector)

**Target commit:** `feat: evidence bundle on Stop (E2E-01, E2E-04..E2E-08)`
**Acceptance criteria:** E2E-01, E2E-04, E2E-05, E2E-06, E2E-07, E2E-08
**Verify before commit:** full round-trip works — prompt in, evidence bundle out, with diff, test result, and summary.

### Session 6 — Step 6 (Session persistence)

**Target commit:** `feat: session continuity across messages (E2E-03)`
**Acceptance criteria:** E2E-03
**Verify before commit:** two-message conversation — second message references the first and CC has the context.

### Session 7 — Step 7 (Error paths)

**Target commit:** `feat: error handling and task history (ERR-01..ERR-06)`
**Acceptance criteria:** ERR-01 through ERR-06
**Verify before commit:** walk through each error scenario: concurrent tasks, /stop, timeout, CC crash, redis disconnect, bot restart.

### Session 8 — Step 8 (Hardening + QG)

**Target commit:** `chore: harden and finalize MVP`
**Acceptance criteria:** SEC-02, QG-01 through QG-08
**Verify before commit:** run the full acceptance test suite. Every criterion from Section 11 passes.

### Session 9 — Step 9 (Docs)

**Target commit:** `docs: README, operations, troubleshooting`
**Acceptance criteria:** DOC-01, DOC-02, DOC-03
**Tag:** `v0.1.0-mvp`

---

## What to do if a session goes wrong

- **Agent starts writing code before you confirmed the step.** Stop it. Remind it of rule 6 in CLAUDE.md. Ask it to roll back any uncommitted changes.
- **Agent suggests adding a V1+ feature.** Remind it of `SPEC.md` §14. Out-of-scope features go in an issue for later, not into the MVP.
- **Agent says "this part of the spec is wrong."** Good — that's what `DEVIATIONS.md` is for. Have the agent write up the disagreement there and wait for your call before deviating.
- **Session context gets too large.** Commit what's good, start a fresh session. The spec-on-disk pattern means you lose nothing.
- **Acceptance criterion fails.** Don't accept "good enough." Either fix the code or write a deviation explaining why the criterion is wrong. No silent skips.

---

## Closing every session

Before you end a session, confirm:

- [ ] All new code is committed.
- [ ] Commit message references relevant acceptance criterion IDs.
- [ ] `DEVIATIONS.md` is up to date if anything was deviated.
- [ ] No uncommitted changes to `SPEC.md` — spec edits need their own commit with justification.
- [ ] The next session's starting point is obvious from the commit log.
