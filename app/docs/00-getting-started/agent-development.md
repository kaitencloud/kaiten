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
`--output DIRECTORY`. Application-page outbound external requests are blocked
(this is not a browser-wide firewall). Use synthetic actors;
screenshots can still contain visible private data and must not be published.

Agents MUST reproduce with Playwright and pair **before/after screenshot visual
analysis** with **Chrome DevTools MCP DOM/computed-style, console and network
evidence in the same browser session**. Record the observed visual difference
(or no difference), relevant node/style values, redacted console findings and
bounded request method/path/status/failure metadata. Do not assume an empty
helper failure summary proves correct DOM, styles or successful network behavior.
Reproduce → collect both before-evidence kinds → add a focused existing regression
→ make the smallest fix → rerun the regression → reload the same selected page
and collect both after-evidence kinds on the same local instance. If a restart
loses the session, re-establish and document paired evidence, not a silent claim
of same-session continuity. This is not an audit/issue producer or proof by
screenshot alone.

### Same-session DevTools attachment (optional helper mode, required agent evidence)

After separately authorized runtime operations and with Playwright and **Google
Chrome already installed**, keep this terminal open:

```sh
task browser -- http://localhost:3000/customers --devtools-port 9222
```

`--devtools-port` requires interactive mode (provided by `task browser`), an
explicit decimal nonprivileged port in `1024..65535`, and an unused loopback port.
It is rejected for `task capture`, even with `--headed`. Default browser/capture
behavior is unchanged: installed Playwright Chromium, no CDP listener. This
optional mode uses Playwright `channel: 'chrome'`, `launchPersistentContext`, a
fresh private temporary profile, `chromiumSandbox: true`, and loopback remote debugging; no browser
install/download, extension or personal profile. `launchServer`'s websocket is
Playwright's protocol, **not CDP**, so it is deliberately not used in this mode.

The helper first probes both loopback address families without connecting to an
existing listener, then checks the CDP discovery target against a unique target
obtained from its owned Playwright connection and validates its advertised page websocket
as `ws://127.0.0.1:<selected-port>/devtools/page/<owned-target>` before advertising
attachment. It also validates `/json/version`'s browser websocket (which MCP
follows from `--browser-url`) as
`ws://127.0.0.1:<selected-port>/devtools/browser/<id>`. Neither endpoint may include
an external host, credentials, query, fragment or alternate port. Port
preflight is not atomic with Chrome launch; a failed ownership check is a blocker,
never permission to attach to whoever occupies the port. Launch, navigation and
discovery are bounded by `--timeout MS` (`1000..120000`, default `30000`); the
interactive reproduction itself intentionally remains open until window close or
Ctrl-C. Close is bounded to five seconds; the owned profile is removed after
successful context close (including navigation/verification failure). If cleanup
fails, the helper reports a blocker: close its owned Chrome window, remove its
owned temporary profile at the exact path printed in the cleanup error locally, and do not leave MCP attached.
Never kill an unrelated browser/process or remove a personal profile.

### Manual MCP prerequisite — separately authorized, pinned, no acquisition at runtime

Chrome DevTools MCP is **not a repository dependency or automatically configured**.
Its confirmed approved version is **1.11.0**. Separately authorize acquiring
`chrome-devtools-mcp@1.11.0` and configure your MCP client manually to use that
already-installed `chrome-devtools-mcp` executable. Verify the separately provisioned
executable reports version `1.11.0` with `chrome-devtools-mcp --version` before
activation. Never use `@latest`, an unpinned `npx` launcher that may download, or
an auto-downloading MCP config. Do not change a user profile without permission.

For the approved installed executable, the manual MCP process invocation is:

```sh
CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1 CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY=1 \
  chrome-devtools-mcp --browser-url=http://127.0.0.1:9222 \
  --no-usage-statistics --no-performance-crux --redact-network-headers --no-file-navigations
```

This is activation of the separately provisioned **pinned** executable, not a
setup/download command. Set both environment variables in the MCP client's process
environment and all four flags in its arguments: disable usage telemetry, CrUX
external performance lookup, update checks and user-global config discovery;
redact network headers and prevent file navigations. Do not enable
`--autoConnect`, extension-based attachment, a personal Chrome session, another
browser launch or an externally bound listener. Do not silently drop unsupported
privacy flags: report an incompatible/unavailable DevTools MCP as a blocker.

Attach only after the helper prints its verified endpoint; use MCP page listing
to select the exact `http://localhost:3000/customers` page already opened by
Playwright, not a new page/browser. Use the attached Chrome DevTools MCP `take_screenshot` tool
for before/after captures (save with `filePath` in a private reproduction directory)
and **visually inspect both**; inspect the relevant DOM
nodes and computed style properties, relevant console messages and network
requests in that same page/session. Keep the terminal/helper open while fixing,
running the focused regression and reloading the selected page for after evidence.
`task capture` opens another browser and therefore does **not** supply same-session
screenshots. Do not attach a Playwright `wsEndpoint()` as `--browser-url`;
`http://127.0.0.1:9222` is Chrome's HTTP CDP discovery/control endpoint.

The browser URL grants sensitive unauthenticated browser control, even on
loopback. Do not publish it, tunnel it, expose it on `0.0.0.0`, use it against an
existing listener, or store it in public artifacts. Use only synthetic local
actors. Inspect the minimum relevant DOM/style and console/network metadata;
no broad page/console/network dumps, headers, bodies, tokens, provider credentials
or personal data in evidence. Screenshots remain private. Detach/stop the MCP
process when done, close the helper's browser or press Ctrl-C, and verify cleanup.

If installed Chrome, the approved MCP pin/client/tools, authorized runtime or
same-session attachment is unavailable, report exactly what is blocked and which
evidence/regression was and was not collected. Fixture tests do not prove live
Chrome binding, DevTools privacy flags or screenshot/DOM correctness; do not
claim complete reproduction or substitute screenshot-only analysis.

## Verification boundary

Source/fixture/offline Go verification does NOT prove fresh startup, repeated dev,
CDC delivery across API replacement, Linux ownership, debugger breakpoints or real
screenshots. Those require explicitly authorized setup/runtime operations and the
installed prerequisites. Independent Dapr topology and Delve permissions must be
proved live before advertising restart/debug event-delivery guarantees.
