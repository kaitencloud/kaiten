# Kaiten: instructions for coding agents

Kaiten is an open-source SaaS management tool: a Go API, a React console, Helm
charts and shared frontend packages, in one repository. This file is read by
Codex; `CLAUDE.md` imports it for Claude Code. Human contributors: start with
[README.md](./README.md) and [CONTRIBUTING.md](./CONTRIBUTING.md).

## Layout

| Path | What it is |
| --- | --- |
| `api/` | Backend API in Go (`api/internal/modules/<module>/<usecase>/`) |
| `app/` | The web console: React, TypeScript, TanStack, Vite+ |
| `app/docs/` | Frontend documentation; start at `app/docs/AI_CONTEXT.md` |
| `charts/` | Helm charts (`kaiten`, `kaiten-infra`) |
| `packages/` | Workspace packages: `theme` (design tokens), `api-codegen` (SDK generation) |
| `docker/`, `compose.yml` | Local stack: Envoy, RabbitMQ, Dapr, database |
| `.agents/skills/` | Agent skills (see below) |

## Install and run

- Prerequisites are listed in `DEVELOPMENT.md`. Node 24 is pinned in `app/.nvmrc`;
  pnpm is pinned by the `packageManager` field of the root `package.json`.
- Install the workspace once, from the repository root: `pnpm install`.
- Explicit `task setup` provisions dependencies/images and generates the client
  once, preserving existing `.env`; then `task dev` runs the prepared Docker stack,
  local accounts and frontend. `task seed` explicitly adds demo product data.
  `task up` starts the stack without the frontend; `task down` stops it;
  `task --list` shows every task.
- `pnpm run dev:mock` in `app/`, after `pnpm run generate`: the console alone,
  with no sign-in and the whole API answered by Mock Service Worker in the page.
- Run package scripts with `pnpm run <script>`, from the directory that owns
  them (`app/` for the console).

## Local feature workshop

Use [local development](app/docs/00-getting-started/agent-development.md) and the
same root `Taskfile.yml` as humans: explicit `setup`, prepared `dev`, bounded
`status`/`logs`, `debug`, `browser` and `capture`. No agent-only command tree.
`dev` never installs/generates/builds or rotates credentials. Never treat mocked
UI as backend proof. Keep captures private and use synthetic actors, not provider
or customer credentials. During Playwright local reproduction, agents MUST pair
before/after screenshot visual analysis with Chrome DevTools MCP DOM/computed-style,
console and network evidence from the **same browser session**. Use the optional
`task browser -- <loopback-url> --devtools-port 9222` attachment workflow in the
local-development guide; never attach a personal browser or treat `task capture`
(a separate session) as same-session evidence. Add/rerun a focused regression.
If installed Chrome or separately authorized pinned DevTools MCP is unavailable,
report the blocker and incomplete evidence honestly; do not install/start tools
without authorization or substitute screenshot-only verification.

## Architecture rules (frontend)

- The rules are written once, in `app/docs/AI_CONTEXT.md`: the
  [layers](app/docs/AI_CONTEXT.md#layers), the
  [import rules](app/docs/AI_CONTEXT.md#import-rules) and the
  [principles](app/docs/AI_CONTEXT.md#principles). The details are in
  `app/docs/01-architecture/`.
- Two commands enforce the import rules, both from `app/`:
  `pnpm run check:architecture` (the dependency direction between layers) and
  `pnpm run lint` (npm package imports, what routes may use, file names). The
  principles are enforced by review only: the `app-architecture-guardian` skill
  and the `architecture-reviewer` subagent check what no script does.

## Before a pull request

The checklist is in
[CONTRIBUTING.md](./CONTRIBUTING.md#before-you-open-a-pull-request): one item per
area (frontend, backend, design tokens, charts, documentation, commits). The
`pr-check` skill runs it and reports a summary.

## Generated files: never edit by hand

Regenerate them instead; the hooks in `.claude/settings.json` and
`.codex/hooks.json` refuse edits to the first two.

- `app/src/api-client/**`: `pnpm run generate` in `app/` (not tracked).
- `app/src/routeTree.gen.ts`: written by the TanStack Router plugin when the
  dev server or a build runs.
- `app/src/lib/api/scopes.gen.ts`: written by `pnpm run generate`.
- `app/openapi.yaml`, `app/platform-openapi.yaml`: `task generate:oas`, from the
  Go source.
- Go files headed `Code generated ... DO NOT EDIT` (sqlc output under
  `infrastructure/db`, gqlgen's `generated` package): `task generate:sqlc` and
  `task generate:gqlgen`.

## Skills and subagents

- Skills live in `.agents/skills/<name>/SKILL.md` (Codex reads them there).
  `.claude/skills/<name>` is a relative symlink to the same folder for Claude
  Code; add one when you add a skill:
  `ln -s ../../.agents/skills/<name> .claude/skills/<name>`.
- Workflow skills: `pr-check`, `generate-api`, `generate-api-errors`,
  `new-feature`, `frontend-quality-gate`, `api-client-regeneration-check`,
  `docs-sync-enforcer`.
- Frontend review skills: `app-architecture-guardian`,
  `detail-view-duplication-watch`, `dialog-via-route-guard`,
  `feature-template-scaffolder`, `forms-zod-source-of-truth`,
  `i18n-hardcoded-text-scanner`, `query-key-invalidation-auditor`,
  `state-layer-separation-check`, `table-pattern-enforcer`.
- The `architecture-reviewer` subagent is defined twice with the same text:
  `.claude/agents/architecture-reviewer.md` and
  `.codex/agents/architecture-reviewer.toml`. Change both together.

## House rules

- Write documentation, code comments and commit messages in English.
- User-visible text goes through i18n: add each key to both
  `app/src/lib/i18n/locales/en.ts` and `fr.ts` (`pnpm run check:i18n-parity`,
  `pnpm run check:i18n-keys`).
- Verify that a command exists (`package.json` scripts, `Taskfile.yml`) before
  you write it into a doc or a skill.
