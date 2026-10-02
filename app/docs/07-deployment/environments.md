# Environment variables

The app is configured with `VITE_*` variables. There is no per-environment
switch in the code (no staging or production setting): what differs between a
local run and a deployment is which variables are set, and when. The one mode
the code reads is Vite's: `import.meta.env.MODE` is `production` in a build,
and a production build refuses to start without `VITE_API_URL`.

`app/.env.example` lists the variables with a comment each.

## Where the values come from

| You run | The values come from |
| --- | --- |
| `task dev` or `task app` (repo root) | The task sets `VITE_LOCAL_AUTH` (`true`, unless you pass `LOCAL_AUTH=false`) and derives `VITE_API_URL` from `KAITEN_PORT`. |
| The dev server on its own (`pnpm run dev` from `app/`) | `app/.env.local`, copied from `app/.env.example`, or the shell. |
| The Docker image | Environment variables of the container, at start (see [Docker](./docker.md)). |
| The Playwright suites | The configs (`app/playwright.config.ts`, `app/playwright.app.config.ts`) set what they need; see [testing](../06-testing/README.md). |

`app/.env.local` is git-ignored, like `.env` and `.env.*.local`. Vite loads it
for builds as well as for the dev server, so keep the local-only variables
below out of any file a deployment build reads. A variable that is already set
in the shell when Vite starts takes precedence over the files, which is how
`task app` sets its two.

## Build time and start time

Vite replaces `import.meta.env.VITE_*` with its value when it builds the bundle
or starts the dev server. Four variables have a second path so that one image
serves any deployment: `app/src/env.ts` holds a placeholder for each (for
example `${VITE_API_URL}`), the build isolates them in a `runtime-config` chunk,
and the container's entrypoint replaces the placeholders at start with
`envsubst` (see [Docker](./docker.md#configuration-at-start-up)). The chunk's
file name does not depend on the values, so nginx serves it with
`Cache-Control: no-cache` and browsers revalidate it (see
[Docker](./docker.md#what-the-container-serves)).

`env.ts` resolves each of the four in this order: the value the container
substituted, then the value present at build time, then empty. An unsubstituted
placeholder counts as empty. An empty `VITE_API_URL` makes a production build
throw when the page loads; for the other three, empty means "not configured".
Every other `VITE_*` variable is fixed at build time and has no effect on a
container.

## Variables

### Set at container start, or at build

| Variable | Required | What it does |
| --- | --- | --- |
| `VITE_API_URL` | In a production build. Elsewhere it falls back to `http://localhost:6060/api`. | Base URL of the API, ending in `/api` (trailing slashes are removed). The app appends REST paths, `/graphql` and `/v1/notifications/stream` to it. The API is served under `/api`, so a URL without that suffix sends requests to the app instead of the API. |
| `VITE_CLERK_PUBLISHABLE_KEY` | When the app mounts Clerk, which it does unless the build sets `VITE_LOCAL_AUTH` or `VITE_E2E_BYPASS_AUTH`. | Clerk publishable key, passed to `ClerkProvider` (`app/src/components/clerk-provider.tsx`). |
| `VITE_KAITEN_PLATFORM_API_URL` | No | With the token below, points the app at a Kaiten API (URL ending in `/api`) from which it reads the flags that gate some of the console's own features (`demo-sandbox`, `webhooks`), over OFREP. |
| `VITE_KAITEN_PLATFORM_FLAGS_TOKEN` | No | Token with the `read:feature_flags` scope for that API. Set both or neither. It is sent to every browser that loads the page, so it must carry that scope only. |

When the last two are not both set, the dev server and the `VITE_LOCAL_AUTH` and
E2E builds read the flags from `VITE_API_URL`; any other build evaluates
nothing, so every such flag is off and the console hides the webhooks pages. The
logic is in `app/src/lib/feature-flags.ts`.

All four values reach the browser. None of them is a secret.

### Fixed when Vite starts

Read when the bundle is built or the dev server starts. A container cannot change
them.

| Variable | What it does |
| --- | --- |
| `VITE_LOCAL_AUTH` | `true` replaces Clerk with the dev account switcher, which signs in with the tokens of `dev/tokens.json`. The `tokens` service of the compose stack writes that file (`task up`, `task dev` and `task quickstart` start it). Local stacks only: a production build replaces the tokens module with an empty list. |
| `VITE_E2E_BYPASS_AUTH` | `true` skips sign-in: the app renders without Clerk and without tokens. For the Playwright app suite and `pnpm run dev:mock`. |
| `VITE_E2E_MSW` | `true` lets the Playwright app suite start Mock Service Worker in the browser and serve the API from mocks (`app/src/e2e/msw/`). |
| `VITE_MOCK_API` | `true` serves the whole API from mocks in the browser (`app/src/e2e/msw/dev.ts`), with no backend behind the dev server. `pnpm run dev:mock` sets it, with `VITE_E2E_BYPASS_AUTH`. Ignored when `VITE_E2E_MSW` is `true`. |
| `VITE_MOCK_NOTIFICATIONS` | `true` serves only the notifications endpoints from mocks (`app/src/e2e/msw/notifications-dev-seed.ts`); every other request reaches the real API. Ignored when `VITE_E2E_MSW` or `VITE_MOCK_API` is `true`. |

### Read by the build tooling

These are read by `app/vite.config.ts` in Node and are never exposed to the
browser.

| Variable | What it does |
| --- | --- |
| `KAITEN_DEV_DIR` | Directory that holds `tokens.json` for the dev-tokens plugin. Defaults to `dev/` at the repository root. Set it when the app runs against a stack other than this repository's compose stack, which writes its tokens elsewhere. |
| `ANALYZE` | `ANALYZE=true pnpm run build`, from `app/`, writes a bundle size report to `dist/stats.html` and opens it. |

## Rules

- Never commit `.env`, `.env.local` or any file that holds real values.
- Never put a secret in a `VITE_*` variable: the browser receives all of them.
- Keep `VITE_API_URL` pointed at the API of the stack you run against. A second
  local stack listens on another port, and `task app` derives the URL from that
  stack's `KAITEN_PORT`.
