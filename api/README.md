# Kaiten API

The Go backend of Kaiten. REST operations are declared with Huma on Fiber and
reach the use cases through the facade in `internal/kaiten`. GraphQL (gqlgen)
is a read-only surface: its resolvers mostly query each module's sqlc code
directly rather than the use cases, and every write is a REST operation. A
GraphQL request needs the scope REST requires for each resource it selects, and
is refused as a whole, with the same `403` problem, when one is missing. Data
lives in PostgreSQL, accessed through sqlc. Code is organised as
`internal/modules/<module>/<usecase>/`.

Prerequisites, the local stack and the pull request checklist are in the
[repository README](../README.md) and [CONTRIBUTING.md](../CONTRIBUTING.md).

## Layout

| Path | Holds |
| --- | --- |
| `cmd/server` | The API server. The container image builds it. |
| `cmd/docs` | Prints the OpenAPI documents (see [Generate](#generate)). |
| `cmd/admin-tools` | The operational CLI (`kaiten-admin-tools`): database migrations (`migrate up`, `status`, `version`, `down-to`) and the administration of organizations, users, platform tokens and service tokens. It runs as a Helm job or a one-shot compose service. |
| `cmd/seeder` | Seeds a database with test data and writes development tokens. |
| `cmd/checkapierrors` | Checks that every operation declares the error statuses it returns. CI runs it with `go run ./cmd/checkapierrors`. |
| `cmd/schema-docs` | Regenerates `docs/database_schema.md`. It is a separate Go module. |
| `config/` | Configuration loading ([below](#configuration)). |
| `internal/` | Modules, infrastructure and shared code. |
| `pkg/` | Shared packages outside `internal/`, such as `scope` and `apierrors`. |
| `tests/` | Integration tests and their fixtures. |

## Run from the repository root

Developer workflows use [Task](https://taskfile.dev). Run `task` from the
repository root; each task changes into `api/` itself.

```bash
task --list
```

## Configuration

The API is configured by environment variables, and optionally by a
configuration file. No file is required: the API starts on the environment
alone.

Precedence runs lowest to highest:

```
built-in default  ->  optional configuration file  ->  environment variable
```

An environment variable always wins over the same setting in a file. Commit the
settings that are the same everywhere, and let each deployment's own variables
carry the few that differ. Required settings are checked on the result of that
merge, so a file may omit `KAITEN_DATABASE_CONNECTION_STRING` when the
environment supplies it. A `.env` file in the working directory is loaded
first; it never overrides a variable that is already set.

Two settings have no default and are always required. Either side may carry
them:

| Required setting | Variable | File key |
| --- | --- | --- |
| Database DSN | `KAITEN_DATABASE_CONNECTION_STRING` | `database.connection_string` |
| Public listener port | `KAITEN_API_PORT` | `server.port` |

`metered.api_url` and `metered.token_file` are also required when
`metered.enabled` is `true`. A second, internal listener serves
`/api/platform/**` on `server.platform_port` (`KAITEN_PLATFORM_API_PORT`,
default `3001`, which must differ from the public port). Keep it on a private
network.

### Discovery

With `KAITEN_CONFIG_FILE` unset, the API looks in `KAITEN_CONFIG_DIR` (the
working directory by default) for a file named `config` with a supported
extension. Discovery takes the first match in this order:

```
config.json   config.toml   config.yaml   config.yml
```

Files are never merged, so a `config.json` wins over a `config.yaml` in the same
directory. Finding none is the ordinary case and is not an error.
`KAITEN_CONFIG_FILE` names one file explicitly, and a file named there must
exist, so a typo is reported. A file that is found or named but is malformed,
unreadable, or contains a key that no setting claims is an error too.

### Keys

Every setting is one row of the `settings` table in
[`config/config.go`](config/config.go): file key, environment variable,
default, and whether it is a credential. The sections are `server`,
`database`, `logging`, `graphql`, `otel`, `retention`, `metered` and
`connectors`. [`config.example.yaml`](config.example.yaml) lists every key with
its variable.

A value in the file is taken literally: there is no `${VARIABLE}` expansion.
The credential keys, `database.connection_string` and `otel.authorization`,
therefore belong in the environment. The chart refuses to render a
`values.yaml` that sets either. A literal is acceptable in a local file that is
not committed.

### In a container and in a cluster

The image (`Containerfile`) is built `FROM scratch`, carries no configuration
file and starts in `/go/bin`, so discovery finds nothing there. Use environment
variables alone, or mount a file and set `KAITEN_CONFIG_FILE` (or
`KAITEN_CONFIG_DIR`).

The Helm chart (`charts/kaiten`) does this for you:

- `api.config` in `values.yaml` is rendered into a ConfigMap, mounted under
  `api.configMountPath`, and named by `KAITEN_CONFIG_FILE`.
- `api.env` sets plain environment variables, which override `api.config`.
- Credentials come from `api.secret`, `api.secret.existingSecret` or
  `api.extraEnv`.
- `server.port` and `server.platform_port` are set by the chart from
  `api.service.port` and `api.service.platformPort`. The chart refuses them in
  `api.config`.

## Build

Build the API binary into `api/bin/api`:

```bash
task build:api
```

The equivalent command, from `api/`:

```bash
go build -o bin/api ./cmd/server
```

## Test

Run the tests:

```bash
task test:api
```

The task runs `go test -shuffle=on ./...`. The integration tests under
`tests/integrations` start PostgreSQL with testcontainers, so they need a
running Docker daemon.

Extra `go test` flags pass straight through:

```bash
task test:api -- -v -run Usage
task coverage:api            # writes api/coverage.out in atomic mode
```

## Lint, format and audit

These tasks cover both Go modules, `api/` and the nested `api/cmd/schema-docs`:

```bash
task lint:api       # golangci-lint --fix: review the diff it leaves
task fmt:api        # gofumpt + gci
task vuln:api       # govulncheck
task deadcode:api   # unreachable functions; findings need triage
```

## Generate

Generate the sqlc query code:

```bash
task generate:sqlc
```

Generate the GraphQL code:

```bash
task generate:gqlgen
```

Generate the OpenAPI documents from the Go source:

```bash
task generate:oas
```

It writes the Core document to `api/openapi.yaml` (git-ignored) and to
`app/openapi.yaml`, and the Platform document to `app/platform-openapi.yaml`.
The two files under `app/` are committed. To print a document yourself, from
`api/`:

```bash
go run cmd/docs/main.go openapi            # Core document, on stdout
go run cmd/docs/main.go platform-openapi   # Platform document, on stdout
```

After a change to the API contract, regenerate the console's client with
`pnpm run generate` from `app/`.

Regenerate the database schema documentation (`docs/database_schema.md`):

```bash
task schema-docs
```

It runs a throwaway PostgreSQL through Dagger, so it needs Docker, and it reads
`KAITEN_DATABASE_USER` and `KAITEN_DATABASE_PASSWORD` from `.env`.

## Docs endpoint

The Core API serves its reference page at `/api/docs` once the server runs. It
also serves the OpenAPI document at `/api/openapi.yaml` and
`/api/openapi.json`.

The internal listener serves the Platform API the same way, on
`server.platform_port`: `/api/docs` for the page and
`/api/platform-openapi.yaml` or `/api/platform-openapi.json` for the document.
