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
with synthetic actors through `task browser -- <loopback-url> --devtools-port 9222`.
Agents MUST pair before/after screenshot visual analysis with Chrome DevTools MCP
DOM/computed-style, console and network evidence from that **same Playwright-owned
browser session**. Follow the guide's manual separately authorized MCP setup pinned to **1.11.0**:
`--browser-url=http://127.0.0.1:9222`, `--no-usage-statistics`,
`--no-performance-crux`, `--redact-network-headers`, `--no-file-navigations`,
`CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS=1`, `CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY=1`.
Use the already-installed `chrome-devtools-mcp` executable, separately provisioned
at `chrome-devtools-mcp@1.11.0` and version-checked before activation; no `npx`
activation downloads, autoConnect,
extension, personal session or automatic downloads. The CDP URL is a sensitive
control endpoint, not the Playwright websocket. Select only the reproduced page;
inspect relevant nodes/styles and bounded redacted console/network metadata, not
broad dumps. Use the attached MCP `take_screenshot` tool and visually compare screenshots on the
same page before and after; `task capture -- <url>` opens a separate session and
cannot substitute. Correlate with `task logs -- <service>`. Do not save headers,
bodies, provider credentials or raw console secrets, attach personal profiles or
publish captures. Missing installed Chrome/DevTools MCP is an honest blocker to
combined verification, never permission to install or claim screenshot-only proof.

Add focused existing scenarios/drivers from `app/e2e/app/_support/app-test.ts`,
fix the smallest verified cause, rerun the regression and collect both after-evidence
kinds in the still-owned browser session (reload the selected page after the fix). Use
`task debug SERVICE=api` only after explicit image-build/start authorization;
`task debug:test PACKAGE=...` may have Docker TestMain prerequisites. Fixture/source
verification alone does not prove live CDC, browser behavior or debugger breakpoints.
No implicit install, reset, seed, rotation, CI/issue automation or publication.
