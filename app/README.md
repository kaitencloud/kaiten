# Kaiten console

The web console of Kaiten: a React single-page application to manage customers,
instances, entitlements, licenses, feature flags, releases, components, deployment
zones, connectors, webhooks, service accounts and the audit trail. Features live
in `src/features/<name>/`, and each has a README of its own. The interface is
available in English and French.

## Quick start

The console needs a running backend to show anything. Start the local stack from
the repository root, install the workspace, then generate the API client and start
the dev server from `app/`:

```bash
# Repository root: the backend, with accounts and dev tokens
cp .env.example .env
task up
pnpm install

# From app/
pnpm run generate                   # writes src/api-client, which is not committed
VITE_LOCAL_AUTH=true pnpm run dev
```

The console is then on <http://localhost:3000>, and its dev account switcher lists
the users the stack seeded. The dev server listens on port 3000, the one origin the
local stack's Envoy accepts credentialed requests from (`KAITEN_APP_URL` in the root
`.env.example`).

For the whole stack, the client and the dev server in one command, run `task dev`
from the repository root instead. [Setup](./docs/00-getting-started/setup.md) covers
both paths, the prerequisites (Node 24, pnpm through Corepack) and the environment
variables; [`.env.example`](./.env.example) lists them.

To work on the interface without the stack, `pnpm run dev:mock` serves the console
on the same port with no sign-in, and Mock Service Worker answers the whole API in
the page, from one set of sample records that every page shares. What a page
changes lasts until the tab closes.

## Scripts

Run scripts from `app/` with `pnpm run <script>`:

```bash
pnpm run dev             # Dev server on port 3000
pnpm run dev:mock        # The same, without the stack: the API is mocked in the page
pnpm run build           # Production build
pnpm run test            # Unit tests (Vitest)
pnpm run test:e2e:app    # Application E2E suite (Playwright)
pnpm run storybook       # Storybook on port 6006
pnpm run check:ci        # The checks CI runs, before a pull request
pnpm run generate        # API and GraphQL clients
```

[Scripts](./docs/00-getting-started/scripts.md) lists every script.

## Project structure

```
app/
├── e2e/                 # End-to-end tests (Playwright)
├── cel-engine/          # CEL engine (Rust), compiled to WebAssembly
├── docs/                # Frontend documentation
└── src/
    ├── routes/          # Thin file-based routes (TanStack Router)
    ├── features/        # Business features, one folder each
    ├── domains/         # Business sub-domains shared by several features
    ├── functionals/     # Reusable advanced UI widgets (table, page, cel-editor, ...)
    ├── components/      # Shared generic components (ui/, form/, dialog/, ...)
    ├── api-client/      # Generated API client (REST and GraphQL), not committed
    ├── hooks/           # Shared hooks
    ├── lib/             # Utilities and configuration
    └── e2e/msw/         # MSW mock infrastructure used by the E2E suite
```

[Folder structure](./docs/01-architecture/folder-structure.md) describes each folder
and what may import what. The [tech stack](./docs/00-getting-started/tech-stack.md)
lists the libraries.

## Authentication

The console signs in through Clerk (`@clerk/react`), with the publishable key in
`VITE_CLERK_PUBLISHABLE_KEY`. In local development, `VITE_LOCAL_AUTH=true` replaces
Clerk with a dev account switcher that lists the tokens the local stack writes to
`dev/tokens.json`. `task app` and `task dev` turn it on. See
[Setup](./docs/00-getting-started/setup.md#sign-in-with-clerk).

## API client

The REST and GraphQL clients are generated from `openapi.yaml` and the GraphQL
schemas under `api/internal`:

```bash
pnpm run generate
```

Run `generate`, not `generate-api-sdk` on its own: the latter deletes
`src/api-client/graphql`. See [API generation](./docs/01-architecture/api-generation.md).

## Internationalization

The interface supports English and French. Translations are in
`src/lib/i18n/locales/`, and `pnpm run check:i18n-parity` fails when the two trees
differ. See [i18n](./docs/02-conventions/i18n.md).

## Docker

`app/Dockerfile` builds the production image (nginx, non-root, port 8080). Build it
from the **repository root**, because the build copies workspace packages and GraphQL
schemas from `api/`. `VITE_API_URL`, ending in `/api`, is required when the container
starts:

```bash
# From the repository root
docker build -f app/Dockerfile -t kaiten-app .
docker run --rm -p 8080:8080 -e VITE_API_URL=https://kaiten.example.com/api kaiten-app
```

The console is then on <http://localhost:8080>. There is no Docker setup for
development: the dev server runs on the host. See [Docker](./docs/07-deployment/docker.md).

## Documentation

[`docs/`](./docs/README.md) covers the architecture, conventions, patterns, testing
and deployment of the console. The repository root has the
[README](../README.md), [CONTRIBUTING.md](../CONTRIBUTING.md) and
[AGENTS.md](../AGENTS.md).
