# Setup

This page gets the console running on your machine. There are two paths:

- **The whole stack** (nominal): one command starts the backend in Docker, seeds
  it, generates the API client and starts the dev server.
- **Frontend only**: install, generate the API client and start the dev server
  against a stack that is already running.

Both end with the console on <http://localhost:3000>, signed in through the dev
account switcher. A third path needs no stack at all: [mocked API](#mocked-api).

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | 24 (`app/.nvmrc`) | Everything in `app/` |
| pnpm | 12 (the `packageManager` field of the root `package.json` pins the exact version) | Installing and running scripts |
| [Task](https://taskfile.dev/installation/) | Task 3 | The nominal path (`task dev`) |
| Docker with the Compose plugin | Running daemon | The backend stack |
| Go | The version in `api/go.mod` | `task dev`, through `task generate`, which builds `app/openapi.yaml` from the Go source |
| nvm | Any | `task app` runs `nvm use` |

Enable Corepack once, after installing Node. It provides pnpm at the version of
the `packageManager` field, so there is nothing else to pick:

```bash
corepack enable
```

The root [README](../../../README.md#prerequisites) has the Homebrew commands for
macOS. [CONTRIBUTING.md](../../../CONTRIBUTING.md#setting-up) covers Linux and
Windows (WSL 2), and what to run by hand if you manage Node without nvm.

Two optional tools only matter for some scripts:

- **Chromium for Playwright**: `pnpm exec playwright install chromium`, from
  `app/`. The Storybook tests (`test:stories`) and both Playwright suites
  (`test:e2e`, `test:e2e:app`) need it.
- **Rust and `wasm-pack`**: `pnpm run build:wasm` compiles the CEL engine
  (`app/cel-engine`) to WebAssembly into `app/public/wasm/`. The CEL editor loads
  it at run time for its local syntax check. Without it the editor still works
  and skips that check. The Docker image does not need it on the host: it builds
  the engine itself.

### Ports

| Port | What | Set by |
| --- | --- | --- |
| 3000 | The console dev server | `KAITEN_APP_PORT` (the `dev` script fixes 3000) |
| 6060 | The API, behind Envoy | `KAITEN_PORT` in `.env` |
| 3100 | The dev server of the Playwright app suite | `app/playwright.app.config.ts` |
| 6006 | Storybook, and the Storybook Playwright suite | `pnpm run storybook` |

Envoy accepts credentialed requests from one origin only, `KAITEN_APP_URL`
(`http://localhost:3000` in `.env.example`). If the dev server listens somewhere
else, change `KAITEN_APP_URL` to match and restart the stack, or the browser
blocks every API call.

## The whole stack

From the repository root:

```bash
cp .env.example .env
task dev
```

`.env.example` holds working values for a local stack. `task dev` runs, in order:

1. `task quickstart`: builds and starts the backend in Docker (database, API,
   events pipeline, Envoy), with an organization, five users and fake product
   data.
2. `task generate`: writes `app/openapi.yaml` from the Go source, then generates
   the REST and GraphQL clients into `app/src/api-client`.
3. `task app`: `nvm use`, `pnpm install`, then the dev server on
   `KAITEN_APP_PORT`. It sets `VITE_LOCAL_AUTH=true` and derives `VITE_API_URL`
   from `KAITEN_PORT`, so the console talks to this stack's own API.

Open <http://localhost:3000>, choose an organization and a user in the dev account
switcher, and the console loads. The root README lists the other tasks
(`task up`, `task down`, `task reset`, `task test:app`) and how to run a second
stack.

## Frontend only

Use this path to work on `app/` or `packages/theme` without the Go toolchain. It
needs a stack to talk to, and `task up` provides one with Docker and Task alone:

```bash
# Repository root: the backend, with accounts and dev tokens
cp .env.example .env
task up

# Repository root: install the workspace (this builds packages/theme)
pnpm install

# From app/
cd app
pnpm run generate              # writes src/api-client
VITE_LOCAL_AUTH=true pnpm run dev
```

What each step does:

- **`task up`** starts the backend with an organization and five users, and no
  product data (`task quickstart` seeds product data too). Its `tokens` service
  writes `dev/tokens.json`, the accounts the dev switcher lists. The API answers on
  `http://localhost:6060/api`, which is the address the app falls back to in
  development when `VITE_API_URL` is unset.
- **`pnpm run generate`** needs neither Go nor Docker: its inputs are the committed
  `app/openapi.yaml` and the `.graphqls` files under `api/internal`.
  `app/src/api-client` is not committed, so the app does not build or test until
  this has run. Run it again when either input changes. Run `generate`, not
  `generate-api-sdk` on its own (see [Scripts](./scripts.md#code-generation)).
- **`VITE_LOCAL_AUTH=true`** replaces Clerk with the dev account switcher.

To avoid typing the variable, copy `app/.env.example` to `app/.env.local`
(git-ignored) and uncomment what you need. `task app` already sets
`VITE_LOCAL_AUTH` and `VITE_API_URL`, so that file matters only when you run the
dev server yourself.

## Mocked API

To work on the interface with no stack, neither Docker nor Go, install the
workspace, generate the client and start the dev server with the API mocked:

```bash
pnpm install                   # repository root
cd app
pnpm run generate
pnpm run dev:mock
```

The console is on <http://localhost:3000> with no sign-in, and Mock Service
Worker answers every API request in the page. Every area starts from the same
sample records, declared once in `app/src/e2e/msw/dev-world/`, so a link from
one page to another leads to a record that exists. A change stays in its own
area, though: a customer renamed on its page keeps its old name in the list of
instances. What you change lasts until the tab closes. The browser console warns
about each API request the mocks do not serve.

The mocks run in a service worker. A browser that refuses one, such as the
browser embedded in an editor, or a private window, gets them in the page
instead (`app/src/e2e/msw/page-network.ts`), with a warning in the console:
every request is still answered but the notification stream, which no longer
updates the bell.

## Environment variables

The console reads `VITE_*` variables. Vite exposes only those to the browser.
Three matter for local development:

| Variable | Effect |
| --- | --- |
| `VITE_API_URL` | Base URL of the API, ending in `/api`. In development it defaults to `http://localhost:6060/api`. It is required in a production build. |
| `VITE_LOCAL_AUTH` | `true` signs in through the dev account switcher, with the tokens in `dev/tokens.json`. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk publishable key, read when `VITE_LOCAL_AUTH` is not `true`. |

[`app/.env.example`](../../.env.example) lists all of them, including the ones
used by tests and mocks. Put comments on their own line in an env file, never
after a value. The variables of a deployed container are in
[Environments](../07-deployment/environments.md). The variables of the backend
stack (ports, database, JWT secret) are in the root `.env.example`.

## Check that it works

- The dev account switcher lists the seeded organizations, and choosing a user
  opens the console.
- The network tab shows requests going to `VITE_API_URL` and answering 200.

If something is off:

| Symptom | Cause and fix |
| --- | --- |
| "No dev tokens found" | The stack is not running, or started after the dev server. Run `task up`, then restart the dev server. |
| `@/api-client/...` imports do not resolve | The client is not generated. Run `pnpm run generate` in `app/`. |
| Every request is blocked by CORS | The app origin differs from `KAITEN_APP_URL`. See [Ports](#ports). |
| Every request fails with `ERR_UNSAFE_PORT` | `KAITEN_PORT` is on a port browsers refuse, such as 6000. The root README explains, and `.env.example` defaults to 6060. |

## Sign-in with Clerk

When `VITE_LOCAL_AUTH` is not `true` (and the E2E bypass is off), the console
wraps the app in Clerk's provider (`@clerk/react`) and redirects signed-out
visitors to Clerk's sign-in. It reads the publishable key from
`VITE_CLERK_PUBLISHABLE_KEY`, in `app/.env.local` for a dev server or as a
container variable for a deployment.

A production build contains no dev tokens (`virtual:dev-tokens` resolves to an
empty list in `app/vite.config.ts`), so the dev switcher is a local-development
tool only: do not set `VITE_LOCAL_AUTH` in a build you deploy. How the API side
verifies the tokens of an identity provider is described under
[Authentication](../../../README.md#authentication) in the root README.

## Next

- [Scripts](./scripts.md): every `pnpm run` script of `app/`.
- [Tech stack](./tech-stack.md): what the console is built with.
- [Architecture overview](../01-architecture/overview.md) and
  [AI_CONTEXT.md](../AI_CONTEXT.md): how the code is organised and the rules it
  follows.
- [CONTRIBUTING.md](../../../CONTRIBUTING.md): the checklist to run before a pull
  request.
