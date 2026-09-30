# Kaiten

An open-source SaaS management tool.

## Repository layout

| Directory                     | Description                                                  |
| ----------------------------- | ------------------------------------------------------------ |
| [api](./api/)                 | Backend API (Go)                                             |
| [app](./app/)                 | Main web application (React + TypeScript)                    |
| [packages](./packages/)       | Shared frontend packages (theme tokens, API codegen)         |
| [charts](./charts/)           | Helm charts for Kubernetes deployment                        |
| [docker](./docker/)           | Docker Compose configuration (Envoy, RabbitMQ, Dapr, etc.) |

The standalone Go SDK lives in its own repository,
[kaitencloud/sdk-go](https://github.com/kaitencloud/sdk-go).

Delivery of webhooks, onboarding of new instances, a third-party identity provider
and the Envoy configuration that wires them in are not part of this repository: a
deployment that wants them adds its own layer.
**No account with any provider is needed to run this repository**, locally or
self-hosted: the one connector that ships here — Attio — stays inert until an
organization activates it and supplies its own key, and its tests talk to an
HTTP double rather than to Attio.

Outbound webhooks are provided by Kaiten Cloud; a self-hosted deployment consumes
the same events from the events pipeline (outbox → Debezium → RabbitMQ), whose
payloads the `webhooks:` section of [`app/openapi.yaml`](./app/openapi.yaml)
documents, and the console hides the webhooks pages wherever Kaiten's platform
flags are not configured.

`api/pkg/` holds the Go packages meant to be imported from outside the API module
(OpenTelemetry setup, Fiber helpers, Debezium helpers, scopes and others), as an
ordinary versioned module instead of a fork. The server code is under
`api/internal/`, and the binaries are under `api/cmd/`.

---

## Prerequisites

The steps below assume macOS with [Homebrew](https://brew.sh/) installed.

```bash
# Task runner
brew install go-task

# Docker Desktop (includes docker compose)
brew install --cask docker

# Go — used by the API (see api/go.mod for the current version)
brew install go

# nvm — manages Node versions (the frontend uses Node 24 via app/.nvmrc)
brew install nvm
nvm install 24
```

> After installing Docker Desktop, open it once and wait for the engine to start before running any `task` commands.

**pnpm** is managed through Corepack. Run this once after installing Node;
Corepack reads the version from the `packageManager` field of the root
`package.json`, so there is nothing else to pick:

```bash
corepack enable
```

For Linux and Windows (WSL 2), see [CONTRIBUTING.md](./CONTRIBUTING.md#setting-up).

---

## Quickstart

```bash
# 1. Copy the environment file
cp .env.example .env
```

`.env.example` holds working values for a local stack, so `task dev` runs with the
file as copied. Three variables are the ones you may want to change:

| Variable                  | Notes                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `KAITEN_PORT`             | Port of the API behind Envoy, `6060` by default. Any free port browsers allow — not `6000`, see below |
| `KAITEN_DATABASE_*`       | Local database credentials, `kaiten` / `kaiten` by default                         |
| `KAITEN_DEV_JWT_SECRET`   | Any non-empty string — only used for local JWT signing                             |

Everything else (OTEL forwarding, ports...) is optional — see `.env.example`.

> **Important:** keep `KAITEN_PORT` off the ports browsers refuse to open.
> `6000` is X11, and Chromium, Firefox and Safari all block it: every API call
> from the frontend fails with `ERR_UNSAFE_PORT` inside the browser, before it
> reaches the network. Envoy stays healthy and answers `curl` throughout, so the
> app is broken with no server-side symptom and no log naming the port. `6060`
> is the default for that reason. `6566`, `6665`–`6669` and `6697` are blocked
> too.

> **Important:** Docker Compose does not support inline comments in `.env` files.
> `KEY=value  # comment` sets the value to `value  # comment` (the comment is included).
> Always put comments on their own line. `.env.example` follows this rule — copy it as-is.

```bash
# 2. Start everything — one command
task dev
```

This single command builds and starts the whole backend stack in Docker
(database, API, events pipeline), seeds it with realistic fake product data,
generates the API and GraphQL clients of the frontend, and launches the frontend
dev server. Once it's up:

| Service         | URL                                                  | Default |
| --------------- | ---------------------------------------------------- | ------- |
| Frontend        | http://localhost:`$KAITEN_APP_PORT`                  | 3000    |
| API             | http://localhost:`$KAITEN_PORT`                      | 6060    |
| Jaeger (traces) | http://localhost:`$JAEGER_UI_PORT`                   | 16686   |
| Envoy admin     | http://localhost:`$ENVOY_ADMIN_PORT`                 | 8080    |
| RabbitMQ UI     | http://localhost:`$RABBITMQ_MANAGEMENT_PORT` — `admin` / `admin` | 15672 |

Every one of those is a variable in `.env`, and none of them is a default worth
memorising: a second stack changes all of them at once. Open the frontend and
use the **dev auth switcher** to log in as one of the seeded users — no account
with any provider needed.

### A second stack, side by side

This stack runs under the compose project `kaiten-oss`, which gives it its own
containers, network, volumes and database. `task up PROJECT=kaiten-wip` starts a
second one beside it.

What the project name does not isolate is `container_name`, host ports or the
`dev/` credential directory. Only `container_name` follows `PROJECT`
automatically. The other two do not:

- **Ports.** Two stacks both asking for 6060 is the second one failing to bind, so
  a parallel stack needs its own value for every port variable in `.env.example`,
  not only the ones in the table above.
- **Credential directory.** A second stack needs its own `KAITEN_DEV_DIR`. Stacks
  that share one overwrite each other's `platform-token` (each is a hash in its own
  database) and `tokens.json`, which the console's dev server reads from that
  directory.

---

## Authentication

Authentication is one mode, and it needs no account with anyone.

### How a caller is identified

On the public port, Envoy is the only place a caller's identity is verified; the
API trusts what Envoy forwards and never checks a signature itself. Two kinds of
credential get in:

- **A JWT.** Locally these are HS256 tokens signed with
  `KAITEN_DEV_JWT_SECRET` (any non-empty string), which the `local-jwks`
  container publishes as a one-key JWKS for Envoy to verify against. A
  self-hosted deployment points the same `jwt_authn` filter at its own
  issuer's JWKS instead — see `docker/envoy/kaiten.yaml.tmpl`. Nothing else
  changes.
- **A Kaiten PAT** (`ksh_...`). Envoy's `ext_authz` filter exchanges it for
  an internal JWT at `/api/tokens/validate`, which is the only public path
  the API exposes for this.

Either way the API reads the same claim contract: `sub` (external user id),
`kaiten_external_org_id` (external org id) and `scopes` are required, plus
optional `email`, `name`, `kaiten_org_name`.

The platform credential (`ksm_...`) is not one of them: the public port refuses
it, and the Platform listener authenticates it itself. See
[The Platform API](#the-platform-api).

### JIT (just-in-time) provisioning

Always on, with no flag to turn it off: the API creates users and
organizations on first sight of a valid token, so there is no separate
"invite" step. Internal UUIDs are derived deterministically from the external
ids in the token (see `api/pkg/externalid`).

### The dev auth switcher

When the stack comes up with accounts (`task up`, `task quickstart`, `task dev`),
the `tokens` service in `compose.yml` signs a token per seeded user into
`dev/tokens.json`. The frontend reads that file when it runs with
`VITE_LOCAL_AUTH=true`, which `task app` sets, so you can switch between seeded
users and organizations instantly without a login screen.

---

## Development tasks

Run `task --list` at any time to see all available tasks.

### Entry points

Four tasks start the stack. They differ in what they seed and in whether they start
the frontend:

| Task              | What it does                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `task dev`        | Stack + accounts + fake product data + frontend. **Start here.**                                                 |
| `task quickstart` | The same stack and data, without the frontend                                                                    |
| `task up`         | The stack with an organization and five users, no product data                                                   |
| `task up:bare`    | Infrastructure only: the schema and the platform credential. No organization, no user: the first login creates both (JIT provisioning) |

### Stack lifecycle

| Task           | Description                                          |
| -------------- | ---------------------------------------------------- |
| `task down`    | Stop everything (keeps data)                         |
| `task reset`   | Throw the database away and rebuild from scratch     |
| `task restart` | Rebuild and restart the API alone, keeping data      |

### Frontend

The frontend always runs locally (not in Docker). `task app` handles
`nvm use`, `pnpm install`, and starting the dev server in one shot — it's
called automatically by `task dev`. It also points the app at this stack's API,
deriving `VITE_API_URL` from `KAITEN_PORT`, which is what makes a second stack's
frontend talk to its own backend rather than to the first one's.

| Task            | Description                     |
| --------------- | ------------------------------- |
| `task app`      | Install deps + start dev server |
| `task test:app` | Run frontend unit tests         |

To work on the frontend without the Go toolchain, see the
[frontend-only setup](./app/docs/00-getting-started/setup.md#frontend-only).

The dev switcher's tokens (`dev/tokens.json`) are written by the stack
itself, by the `tokens` service in `compose.yml` — there is nothing to run
by hand.

> Other frontend workflows (Storybook, E2E tests, production builds, codegen)
> are run with `pnpm run <script>` from `app/`. The scripts are listed in
> [`app/docs/00-getting-started/scripts.md`](./app/docs/00-getting-started/scripts.md).

### Dependency versions (pnpm catalog)

Versions shared by more than one workspace package live in the `catalog:` block
of `pnpm-workspace.yaml`, and each `package.json` references them as
`"catalog:"` rather than repeating a range. Adding a dependency that is already
catalogued means writing `"catalog:"`, not a version — `catalogMode: prefer`
makes `pnpm add` do this for you. Bumping one is a single edit in
`pnpm-workspace.yaml` that moves every consumer at once.

`packages/api-codegen` is the one documented exception: it pins TypeScript
through the named `catalog:codegen` because `@hey-api/openapi-ts` drives the
TypeScript compiler JS API, which the Go-based TypeScript 7 no longer exposes.

### Code generation

| Task                   | Description                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `task generate`        | Full codegen: Go source → `openapi.yaml` → TypeScript SDK + GraphQL types                                              |
| `task generate:oas`    | Generate the OpenAPI spec from Go source and copy it to `app/`                                                         |
| `task generate:sqlc`   | Regenerate sqlc query helpers from SQL                                                                                 |
| `task generate:gqlgen` | Regenerate GraphQL helpers (`go generate ./...`)                                                                       |
| `task generate:sdk-go` | Regenerate the standalone Go SDK from `app/openapi.yaml` (needs `kaitencloud/sdk-go` checked out — see `SDK_GO_DIR`)   |

`pnpm run generate` in `app/` does the last step of `task generate` alone, from the
committed `app/openapi.yaml`, and needs no Go. Use `generate`, not `generate-api-sdk`
on its own: the latter deletes `src/api-client/graphql`.

### Test & quality

| Task            | Description                                                          |
| --------------- | -------------------------------------------------------------------- |
| `task test`     | Everything: backend, frontend and charts (the charts need `helm`)     |
| `task test:api` | Go tests. Flags pass through: `task test:api -- -v -run Usage`        |
| `task test:app` | Frontend unit tests                                                   |
| `task test:charts` | Lint and render the Helm charts                                    |
| `task lint`     | golangci-lint and the frontend linter, both with `--fix`             |

### Logs and status

| Task               | Description                                            |
| ------------------ | ------------------------------------------------------ |
| `task ps`          | What is running                                        |
| `task logs`        | Tail all logs, or one service: `task logs -- api`      |
| `task schema-docs` | Generate schema documentation                          |

---

## Stack anatomy

```
task dev  (or task quickstart, without the frontend)
  │
  ├── envoy          reverse proxy + JWT/ExtAuthz (single entry point)
  ├── local-jwks     publishes KAITEN_DEV_JWT_SECRET as a JWKS for Envoy
  ├── db             PostgreSQL 17 (host port 5452)
  ├── jaeger         distributed tracing UI → http://localhost:16686
  ├── migrate        one-shot: `migrate up` — also creates the system:kaiten identity
  ├── bootstrap      one-shot: mints the platform credential into dev/
  │                  (scripts/local-credentials.sh)
  ├── seed-accounts  one-shot: the `dev` seed profile (organization and users)
  ├── tokens         one-shot: signs the dev switcher's tokens into dev/tokens.json
  │                  (both behind the compose profile `accounts`, which
  │                  task up, task quickstart and task dev enable)
  ├── api            Go API
  ├── api-ready      one-shot: waits until the API answers through Envoy
  ├── seed-data      one-shot: the `demo` seed profile, fake product data
  │                  (compose profile `seed`: task quickstart and task dev only)
  │
  ├── rabbitmq       message broker (AMQP + management UI)        ─┐
  ├── debezium       CDC: streams outbox_events table → RabbitMQ   │ events pipeline
  └── api-dapr-sidecar         Dapr sidecar for the API           ─┘ (started with the stack, no separate task)

Frontend (always local)
  └── task app  → http://localhost:$KAITEN_APP_PORT
```

Webhook delivery and new-instance onboarding are not here: a deployment that
wants them subscribes to the same events pipeline out of process. The Attio
connector is not one of those: it is compiled into this API and consumes the same
stream in process, so there is nothing extra to start for it.

---

## Seed profiles

The seeder (`api/cmd/seeder`) ships several profiles, selectable with
`--profile` / `-p` (repeatable).

**A profile seeds organizations, users and fake product data. It never mints a
credential.** `system:kaiten` comes from a migration, every token comes from
`kaiten-admin-tools` or the `tokens` service, and the entitlement catalogue,
licenses and feature flags of a real deployment are created over the API by
whoever operates it. So no profile mints a PAT, writes a token file, or creates a
Kubernetes Secret.

| Profile       | Purpose                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `dev`         | The 5 shared TMNT identities (Splinter, Leonardo, Donatello, Raphael, April) on the Kaiten Sushi Shop org shell, no product data (run by `task up`, `task quickstart` and `task dev`) |
| `demo`        | The same org and identities as `dev`, plus the full B2B SaaS dataset (Kaiten Sushi Shop): entitlements, licenses, customers, instances, deployment zones/releases, feature flags, usage and audit trail. The default local/demo product data: `task quickstart` and `task dev` run it. |
| `stress-test` | High-volume seed: multiple organizations, users, entitlements, licenses, customers, instances, etc. No task runs it. Against a running stack, run `docker compose --project-name kaiten-oss run --rm seed-data --profile stress-test` when you need load-testing volume (`kaiten-oss` is the project name `task` uses by default). |

You do not run the wired ones by hand. Two of the three are a one-shot service in
`compose.yml`, behind a compose profile that the tasks switch on:

- `dev` is the `seed-accounts` service, behind the `accounts` profile, together
  with `tokens`, which signs the dev switcher's tokens once the accounts exist.
  `task up`, `task quickstart` and `task dev` enable the profile. A raw
  `docker compose up -d` (that is, `task up:bare`) does not, which is why that
  stack has no organization and no user. The `api` service does not wait for it.
- `demo` is the `seed-data` service, behind the `seed` profile: fake product data,
  the slow and genuinely optional part. `task quickstart` and `task dev` run it
  once the stack is up. It writes through the same reporting-enabled use cases
  the API serves, which is why it waits for `api-ready` (the API answering
  through Envoy) rather than for `api`.

List all profiles and their descriptions with:

```bash
cd api && go run ./cmd/seeder list
```

---

## Environment reference

Copy `.env.example` to `.env` — it documents every variable inline. Summary
by section:

| Section              | Variables                                                                                                                                         | Notes                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core                 | `KAITEN_PORT`, `KAITEN_APP_PORT`, `KAITEN_APP_URL`, `KAITEN_DEV_DIR` | The compose project name is not a variable: a second stack is started with `task up PROJECT=<name>`, with its own ports and its own `KAITEN_DEV_DIR`. `KAITEN_APP_URL` is the single origin Envoy's CORS policy allows credentialed requests from |
| Database             | `KAITEN_DATABASE_USER/PASSWORD/DATABASE`, `KAITEN_DATABASE_PORT`                                                                                  |                                                                                                                                                                   |
| Infra ports          | `ENVOY_ADMIN_PORT`, `JAEGER_UI_PORT`, `JAEGER_OTLP_*_PORT`, `RABBITMQ_*_PORT`                                                               |                                                                                                                                                                   |
| Auth                 | `KAITEN_DEV_JWT_SECRET`                                                                                                                           | Any non-empty string. Envoy verifies dev JWTs against it, and the stack signs the dev switcher's tokens with it                                                    |
| Frontend             | `VITE_*`                                                                                                                                          | Read by the console, not by the stack: see [`app/.env.example`](./app/.env.example). `task app` sets `VITE_LOCAL_AUTH` and `VITE_API_URL` itself                    |
| Platform API         | `KAITEN_PLATFORM_PORT`, `KAITEN_PLATFORM_TOKEN_FILE`                | `KAITEN_PLATFORM_PORT` is the host port of the Platform listener, `6001` by default. `KAITEN_PLATFORM_TOKEN_FILE` is where `scripts/local-credentials.sh` writes the `ksm_` credential it mints — read by no server. There is no signing key any more: the Platform listener authenticates the raw `ksm_` against the database itself, so nothing mints or verifies an internal JWT for it |
| GraphQL              | *(none — see `docker/config/api.yaml`)*                                                                                                           | Both off in the API by default and turned on for local dev by the mounted config file, not by a variable — the playground at `/api/graphql/playground` and the introspection it reads the schema from are development-only |
| Observability        | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_AUTHORIZATION`                                                                                  | Both optional overrides — `docker/config/api.yaml` already points the API at the local Jaeger container. Set the first only to forward traces to a remote collector instead |

---

## Auth routing (Envoy)

| Request                     | Filter                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Bearer ksh_*` tokens       | ext_authz → `/api/tokens/validate`, and only ever that exact path (see below), which returns an **unsigned** internal JWT carrying an organization claim |
| `Bearer ksm_*` tokens       | Not accepted here: Envoy routes only `ksh_` to ext_authz, so a `ksm_` on the public port is refused with 401. The Platform listener authenticates it itself, on its own port |
| User JWTs                   | Envoy `jwt_authn`, against the `local-jwks` HS256 key                                                                          |
| `/api/docs`, `/api/healthz`, `/api/openapi.*` | Public (no auth)                                                                     |

Envoy fronts the API's **public** port only. The Platform API listens on a second
port of its own (`KAITEN_PLATFORM_PORT`, `6001` locally) which nothing in this
table routes to — see [The Platform API](#the-platform-api).

The API trusts identity claims only after the reverse proxy has validated the
request. Direct exposure of the API service is unsupported.

`ext_authz` can only PREPEND to the original request path, so a check for
`/api/instances` would land on `/api/tokens/validate/api/instances` and force
the API to publish a wildcard route that bypasses its own auth middleware for
everything beneath it. Envoy instead routes the check through an internal
listener that rewrites the path to the constant `/api/tokens/validate`, so the
API answers exactly one public path and anything else under that prefix is a
plain 404. Note also that `ext_authz` treats **only an exact 200** as
"allowed" — any other status, `204` included, is a denial whose response is
returned verbatim to the caller.

---

## The Platform API

`/api/platform/**` is a second surface on its **own listener**: the same process
and the same paths, on a different port (`KAITEN_PLATFORM_PORT` in `.env`, which
compose hands to the API as `KAITEN_PLATFORM_API_PORT`). The public
port serves the Core API and does not register a single platform route, so
`http://<public>/api/platform/...` is a plain 404 rather than something the public
listener refuses.

The boundary is enforced twice over, and neither half depends on a path check:

- **Position.** Two Fiber apps, two ports. Only the public one is behind the
  gateway; the platform one is reached from inside the cluster (service DNS, Dapr
  service invocation) and is on no HTTPRoute at all.
- **Credential class.** Each listener runs its own authenticator, and the two no
  longer share a credential format. The public one parses the internal JWT the
  gateway forwards, so a `ksm_` is not something it can make sense of — it does not
  look at prefixes or claims to decide, it simply cannot. The platform one reads
  the raw `ksm_` and validates it against the database, refusing anything with
  another prefix before it looks anything up.

What each family may do is then decided per operation, declared in the code, and
published as a distinct OpenAPI security scheme — so the distinction survives into
the generated SDKs.

A platform credential authenticates the global identity `system:kaiten` and carries
**no** organization. To act inside a tenant it names that tenant explicitly and
mints an ordinary org-scoped `ksh_` token from `system:kaiten`'s existing membership
there, bounded by its own scopes. It never impersonates, never creates a membership,
and never becomes org-scoped itself. Revoking it cascade-revokes everything it
issued.

`system:kaiten` is a machine user (`Kaiten <system@kaiten.sh>`) with no organization
of its own, created by a **migration** so it exists before the first start, given
membership in every organization by a database trigger, and undeletable — its slug
contains a colon, which the service-account slug pattern forbids, so no tenant can
create anything that collides with it, and it is invisible to every tenant-facing
service-account query.

Locally, `task up` mints one into `dev/platform-token` (`0600`, gitignored).

A platform caller sends the raw `ksm_` credential straight to the Platform port
(6001 locally). Nothing fronts that port, and there is no exchange and no internal
JWT:

```bash
PT="$(cat dev/platform-token)"                      # ksm_...
ORG_ID=...                                          # the organization to act in

# The Platform API answers on its own port, never through Envoy.
curl -s localhost:6001/api/platform/me -H "Authorization: Bearer $PT"

# Mint an org-scoped token and use it on the Core API
curl -s -XPOST localhost:6001/api/platform/organizations/$ORG_ID/tokens \
  -H "Authorization: Bearer $PT" -H 'Content-Type: application/json' \
  -d '{"name":"tmp","scopes":["read:tokens"]}'   # → a ksh_ token
```

The requested `scopes` must be a subset of the platform credential's own. The
local credential holds `read:organizations`, `delete:organizations`,
`delete:memberships`, `delete:users`, `read:tokens` and `write:tokens`
(`scripts/local-credentials.sh`), and a scope outside that set is refused with a
403. Omit `scopes` to inherit all of them.

The credential is only ever stored as a bcrypt hash, so the plaintext exists once,
at creation. `kaiten-admin-tools platform-token list` shows names, scopes and
expiry — never the secret. A lost token is replaced (`create --replace`), never
recovered.

`/api/platform/**` authenticates the `ksm_` credential itself, on the internal
listener, against the same `token` table and the same cache the Core API's
`/api/tokens/validate` reads for `ksh_`. The gateway does not forward `ksm_`
anywhere, and `/api/tokens/validate` refuses every prefix but `ksh_`, so the code
that authenticates platform credentials is not reachable from the internet at all.
Each listener renders its own document at its own `/api/docs` — the Core one
publicly, the Platform one on the internal port, alongside the operations it
describes.

Four operations that authorize on holding a scope rather than on owning the target
(`get`/`delete-organization`, `delete-membership`, `delete-user`) live here now and
have **left** the Core API — a breaking change to the published contract.

---

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](./CONTRIBUTING.md) has the
checklist to run before a pull request, the commit message conventions, the git
hooks and the release process. [AGENTS.md](./AGENTS.md) describes the layout, the
commands and the rules, for coding agents and for people, and the frontend
documentation starts at [`app/docs`](./app/docs/README.md). A good first step for
any change is:

```bash
task dev        # get a working stack + frontend
task test       # every test: backend, frontend and charts
task lint       # every linter, with --fix
```

For a frontend change, run `pnpm run check:ci` in `app/` before you open the pull
request.

## License

Kaiten is open source and licensed under the
[Apache License, Version 2.0](./LICENSE).

By contributing to Kaiten, you agree to certify your contribution under the
[Developer Certificate of Origin 1.1](./DCO.md). See
[CONTRIBUTING.md](./CONTRIBUTING.md) for details.

The Kaiten name, logos, and other brand assets are not licensed under
Apache-2.0. See [TRADEMARKS.md](./TRADEMARKS.md).
