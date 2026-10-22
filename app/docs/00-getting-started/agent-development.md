# Local development — the same commands for humans and agents

Use the root `Taskfile.yml`, ordinary Compose graph and real application instance.
No agent-only launcher or CodeAlta dependency exists. Mock UI is never backend proof.

## Prepare once, run repeatedly

```sh
task setup                 # explicit downloads/install, generation and image builds; does NOT start apps
task dev                   # prepared backend + local accounts, then foreground frontend
task status                # services, one-shot exits, bounded HTTP readiness
task logs -- api            # last 100 lines / 10 minutes
task capture -- http://localhost:3000/customers
task browser -- http://localhost:3000/customers
task stop                  # retain containers, DB data and credentials
```

Setup preserves an existing `.env`. Node 24, the root pnpm pin, Go 1.27 and
Compose >=2.24.4 are required. Focused explicit provisioning: `setup:app` installs
with the frozen workspace lock and generates the frontend client; `setup:tools`
provisions pinned quality tools into `api/bin`; `setup:browser` installs Chromium;
`setup:images` pulls infrastructure/builds stable local images. Optional CEL editor
WASM needs Rust/wasm-pack and explicit `setup:wasm`. Missing packages/generated
clients/browser/images are setup blockers, not product bugs. `dev` never acquires
tools, installs packages, regenerates contracts, builds images or seeds demo data.

Startup is DB/infrastructure health → migrations/local credential/accounts → API
→ bounded gateway HTTP check. Repeated bootstrap validates the token through the
existing identity bcrypt validator and matches its name, exact scopes and no expiry;
it never treats file existence as validity or rotates on an ambiguous DB failure.
After replacing the DB or losing a token, first check readiness, then explicitly
run `task credentials:rotate`: it revokes that token and every child it issued.
This is intentionally not automatic recovery. Credential mounts use the host UID/GID.

`task quickstart` / `task seed` explicitly populate demo data; later seed execution
uses `--no-deps`, never replaying bootstrap. `task up:bare` keeps accounts absent.
`task dev:mock` is a named UI-only convenience. Advanced `task app LOCAL_AUTH=false`
preserves the existing explicitly configured provider flow, without credential lookup
or installation; it is not the default local mode.

One selected project needs one consistent port set, frontend/gateway origin and
`KAITEN_DEV_DIR`. `PROJECT` changes container/network/volume identity only: for a
parallel instance change all ports and its credential directory together in explicit
local configuration. Do not share tokens between databases. Local published ports
are loopback-only. Dapr has its own internal network identity and addresses `api`
by service DNS; its controls and the API's `/dapr` route remain unpublished.

## Build, reproduce, test

`task build` compiles server/admin tools/seeder/docs and nested schema-docs into
`api/bin`, and builds the frontend using prepared tooling. `task test` covers both
Go modules, frontend units, charts and local workflow fixtures; Go integration
suites need Docker/testcontainers and charts need Helm. `task test:api -- -run Name`
and `task test:api:race -- -run Name` forward filters to both modules. Browser
regressions use `task test:app:e2e -- <filter>` (installed Chromium and generated
clients required), existing `app/e2e/app/_support/app-test.ts` drivers/scenarios.
`test:local` needs Node and the Compose client only, not a running Docker engine.

`task lint` is read-only; `task lint:fix` is explicitly modifying. Pinned
`golangci-lint` has the existing CI Go 1.27.1 export-data constraint: select an
already installed Go 1.27.1 on PATH for lint. `setup:tools` explicitly provisions
that linter with the matching toolchain; lint itself does not download one.

## Debug the same application

```sh
task up
task debug SERVICE=api      # explicit dev-only image build; replace only API
# CLI (after explicit task setup:debug) or .vscode/launch.json:
api/bin/dlv connect 127.0.0.1:40000
task debug:test PACKAGE=./pkg/scope -- -test.run TestName
```

The dev-only Containerfile target pins Delve v1.27.2 and builds with
`-gcflags='all=-N -l'`, preserving DWARF. The release scratch image is unchanged.
The target starts the app with `--continue`, so bootstrap/readiness can finish
before attach; requests still go through the ordinary Envoy gateway. Only
`127.0.0.1:${KAITEN_DEBUG_PORT:-40000}` is published. No privileged container or
speculative extra security permission is added. Unknown `SERVICE` fails before
build/start. IDE source mapping is `/go/kaiten/api` → this checkout's `api`.
Test debugging waits for attach; inspect the selected package's Docker-capable
TestMain. `task restart` explicitly restores the ordinary image for API only.

## Private real-browser evidence

Browser/capture use the existing Playwright package, a fresh owned context and the
selected real loopback app. No personal profile, stored provider session or mocked
backend is attached. Interactive browser stays open until its window closes or
Ctrl-C; capture writes a fresh `dev/reproductions/capture-*` directory with a private
screenshot and bounded console/page/request failure summary. URLs omit queries;
headers, bodies, raw console text and credentials are not saved. Inspect raw console
locally when needed. Optional helper arguments: `--wait SELECTOR`, `--timeout MS`,
`--output DIRECTORY`. Outbound external requests are blocked. Use synthetic actors;
screenshots can still contain visible private data and must not be published.

Reproduce → collect before evidence → add a focused existing regression → make
the smallest fix → rerun the regression → collect after evidence on the same
local instance. This is not an audit/issue producer or proof by screenshot alone.

## Verification boundary

Source/fixture/offline Go verification does NOT prove fresh startup, repeated dev,
CDC delivery across API replacement, Linux ownership, debugger breakpoints or real
screenshots. Those require explicitly authorized setup/runtime operations and the
installed prerequisites. Independent Dapr topology and Delve permissions must be
proved live before advertising restart/debug event-delivery guarantees.
