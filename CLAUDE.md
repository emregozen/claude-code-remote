# CLAUDE.md

This file is read by AI agents (Claude Code, Codex, etc.) at the start of every session. Keep it short. If you're a human reading this: the authoritative spec is `SPEC.md`.

## Rules for AI agents working on this repository

1. **Read `SPEC.md` in full before writing any code.** The spec is the source of truth. This file is just a pointer.
2. **Follow the implementation order in `SPEC.md` Section 12.** Do not skip steps. Do not start a later step before the previous is committed.
3. **Resolve `SPEC.md` Section 13 open questions before starting Step 4.** Write the answers to `DEVIATIONS.md` and update the spec sections they affect.
4. **Log every deviation from the spec in `DEVIATIONS.md`** with a one-line justification. If `DEVIATIONS.md` doesn't exist yet, create it.
5. **Reference acceptance criteria by ID in every commit message** (e.g. `feat: bot auth and commands (SEC-01, SEC-04)`). IDs are defined in `SPEC.md` Section 11.
6. **One step per session.** When a step's commit is made, stop and wait for a human to start the next session. Do not chain steps.
7. **Stop and ask on ambiguity.** If the spec is unclear, write the question in `DEVIATIONS.md` under a "Questions" heading and wait. Do not guess.
8. **Quality gates are non-negotiable.** Every commit must pass `npm run typecheck`, `npm run lint`, and `vitest run`. If any fails, fix before committing.

## What this project is

ClaudeRemote — a mobile-first remote control for Claude Code via Telegram. Two Docker containers: `bot` (Telegram long-poll) and `cc-runner` (Claude Code SDK wrapper). Redis for pub/sub, SQLite for task history. Full architecture in `SPEC.md` Section 1.

## Current phase

**MVP** — per `SPEC.md` Section 1.1. Everything in Section 1.2 is explicitly out of scope and must be rejected if suggested.

## If you're starting fresh

Your opening move in any session should be:

1. `cat SPEC.md` — read the full spec
2. `cat CLAUDE.md` — read this file
3. `cat DEVIATIONS.md` — see prior decisions and open questions
4. `git log --oneline -20` — see what's already been built
5. Identify the next step in `SPEC.md` Section 12 based on the latest commit
6. Confirm with the human which step you're starting before writing code

## What "done" means

The MVP is done when every acceptance criterion in `SPEC.md` Section 11 passes. Not when it "seems to work." Not when the happy path is green. Every criterion, by ID, verified.
