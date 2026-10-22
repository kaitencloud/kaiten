---
name: local-development
description: Use the same root developer workflow as humans to run prepared Kaiten, reproduce real local bugs, capture private evidence and add existing Playwright regressions.
---

Read `app/docs/00-getting-started/agent-development.md`. Use the root Taskfile,
not a parallel agent launcher. `task setup` explicitly provisions dependencies;
`task dev` runs the prepared real local stack and frontend without installations,
generation, demo reseeding or credential rotation. `task dev:mock` is explicitly
UI-only, never backend/auth proof.

Verify selected service/one-shot and HTTP readiness with `task status`. Reproduce
with synthetic actors through `task browser -- <loopback-url>`; collect bounded
request/console evidence and private screenshots with `task capture -- <url>`.
Correlate with `task logs -- <service>`. Do not save headers, bodies, provider
credentials or raw console secrets, attach personal profiles or publish captures.

Add focused existing scenarios/drivers from `app/e2e/app/_support/app-test.ts`,
fix the smallest verified cause, rerun the regression and capture after. Use
`task debug SERVICE=api` only after explicit image-build/start authorization;
`task debug:test PACKAGE=...` may have Docker TestMain prerequisites. Fixture/source
verification alone does not prove live CDC, browser behavior or debugger breakpoints.
No implicit install, reset, seed, rotation, CI/issue automation or publication.
