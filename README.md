# ClaudeRemote

> Control Claude Code from your phone via Telegram.

**Status:** Under construction. This repo follows a spec-driven build; see `SPEC.md` for the authoritative technical specification and `CLAUDE.md` for the rules AI agents follow when contributing.

## What this is

A mobile-first remote control for Claude Code. Send prompts from your phone via Telegram while you're away from your desk; receive a structured evidence bundle (diff, test results, summary) when each task completes.

**MVP scope** is deliberately narrow — see `SPEC.md` Section 1.1 for what's included and 1.2 for what's explicitly not. Screenshots, scheduling, voice, and self-verification are scoped for later versions.

## Quick start

_To be filled in during Step 9 of the implementation plan (SPEC.md §12 Step 9). Acceptance criterion DOC-01 defines what this section must contain._

## For contributors

- `SPEC.md` — the build specification. Read it in full before making changes.
- `CLAUDE.md` — rules for AI agents. If you're using Claude Code, Codex, or similar on this repo, this file is mandatory reading.
- `DEVIATIONS.md` — log of every deviation from the spec, plus unresolved questions.

## Security caveat

_Warning verbatim from SPEC.md §10.3.3 — to be reproduced here during Step 9:_

> The bot can run any code on your behalf, including destructive commands. Only run on a project you control, and consider running the stack in a VM if the workspace contains sensitive data.

## License

TBD
