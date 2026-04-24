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

_(none yet)_
