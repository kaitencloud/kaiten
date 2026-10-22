# Manually launched, bounded agent repair

This is a standalone operating runbook, not an unattended agent framework.
`pr-check` remains a read-only review gate: stop on failures; never silently turn
it into a writer. No schedule, persistent agent credential, provider/customer
access, install, stack startup or publication is authorized by this document.
Keep `CONTRIBUTING.md`, Apache-2.0/NOTICE attribution and DCO sign-off requirements.

## 1. Establish scope and safe evidence

Agree one issue, one owned branch, one narrow fix. Preserve dirty work and stop
before overwriting an unrelated change. Record revision and profile, expected
versus actual behavior, minimal synthetic reproduction and a failing baseline.
Missing tools, config, credentials, Docker or vulnerability databases are
**blocked**, not product defects. Do not create an issue for an environment
blocker. Set an iteration budget before starting (for example two reproduction
attempts, 30 minutes and a fixed subprocess/runtime budget); stop and ask for a
specific decision if that budget or scope is exceeded.

From the repository root, with already installed prerequisites:

```sh
python3 scripts/doctor.py --profile backend --json
python3 scripts/audit.py --profile static --area backend --evidence
python3 scripts/audit.py --profile unit --area tooling --evidence
python3 scripts/diagnose.py --project kaiten-oss --port 6060 --evidence
```

The last command only inspects the named **existing** stack; it never starts,
executes inside, tears down or prunes it. Container image content IDs, startup
one-shots, process liveness and gateway health are separate observations.
Dapr/Debezium/RabbitMQ functional readiness is **not** proven by HTTP 200; no
synthetic data or authenticated request is sent by diagnosis.

`task --exit-code check`, `audit` and `diagnose` forward the same script flags.
`check` defaults to all areas if no `--area` is specified, never narrows silently
based on a missing Git base. Repeat `--area` to select explicit scope. Each
command has a 1..600s bound; subprocess output is discarded, capped at 128 KiB,
and only owned process groups are terminated. JSON stdout stays machine-readable;
0 = passed, 1 = failed, 2 = blocked. A successful selected subset is not full CI.

| Profile | Implemented gate inventory | Explicit unexecuted coverage |
| --- | --- | --- |
| `static` | Both Go modules: dependency graph, build/vet, tidy diff, endpoints; lint explicitly blocked until offline named-toolchain verification; frontend formatting/lint/typechecks/import/contracts/i18n/file sizes/contrast; theme check; Helm lint/render and no-secret-plumbing assertion; Python/Node tooling fixtures | Build/codegen drift, theme pack/CSS/published drift and Wasm build need an owned clean checkout and explicit setup |
| `unit` | Frontend unit, generator unit, locked/offline Rust tests; Python/Node tooling fixtures | Backend full normal/race suites are Docker-capable even in CI's “unit” shard (`TestMain` starts testcontainers); blocked without owned-runtime authorization |
| `runtime` | Reports authorization blocker; use existing suites only after separate approval | Backend normal/race, Chromium shards, Firefox/WebKit, dev-mock, Storybook visual, CEL browser, authenticated disposable stack; no execution through this command |
| `security` | Reports setup/privacy blockers | Explicitly authorize installed scanner/local DB and isolated secret scan; existing `task vuln:api` may download tools/database and is not an offline audit |

Do not run generation or build over user-owned generated files during diagnosis.
The existing CI jobs and contributor checklist remain the complete matrix.
No automatic Go toolchain/module, Corepack or Cargo network acquisition is enabled
by audit scripts; explicitly prepare tools/caches elsewhere before retrying.

## 2. Private artifacts, not an upload bundle

The manifest schema is version 1: revision, dirty boolean (no paths/content),
profile, timestamps, allowlisted prerequisite/version metadata, command
passed/failed/blocked/skipped status, exit/duration/reason, stable finding key,
and relative artifacts. `.audit/<unique-run>/` is ignored; directories are 0700
and manifests 0600. Existing unsafe or symlinked evidence locations are refused,
not rewritten. Keys derive from profile plus failing command identities/status
and fixed reasons, not time, revision or private output. They group reproducible
symptoms, not guaranteed root causes; manually refine a key only with safe,
stable failure-class metadata when triage proves two different defects.

Never collect `.env`, rendered Compose/env/inspect dumps, `dev/tokens.json`,
platform credentials, Authorization headers, request bodies, DSNs or database
dumps. There is intentionally no raw-log option: allowlisted metadata is safer
than bulk capture plus regex redaction. Stage issue/PR bodies under `.audit/`
locally. Copy only reviewed synthetic metadata into them; manifests are private
by default, not a public evidence guarantee. Screenshots, browser reports and
JSON reporter output need explicit synthetic-data review before publication.

The existing `pnpm run test:e2e:stack` (in `app/`) is **not** called by audit.
With separate authorization it creates random project/ports/credentials and
loopback-only mappings with bounded restricted/duplicate-port retries using Compose's `!override` support (Compose >= 2.24.4).
It inherits only tool location/home/CI/browser-path settings, not provider
configuration. It bounds build/start to 360s, health wait to 120s, requests to
2/5s, commands to 60s (DB 10s), Playwright to 480s and teardown to 45s. Signal
cleanup removes only owned resources, deletes temporary credentials, and records
teardown failure as failure. SIGINT/SIGTERM remain nonzero (130/143); SIGKILL,
host loss, daemon failure and the released-port allocation race cannot guarantee
cleanup. Inspect the exact recorded owned project manually; never global prune.

Reports/results/JSON go to the unique private run directory and survive cleanup.
Authenticated traces are disabled because tokens can be embedded in browser
state. Raw Docker/Playwright output is not printed or persisted automatically.
The stack CI job uploads **only** the allowlisted status manifest, not browser
artifacts; do not feed authenticated artifacts into public preview publishing.
Allowlisted image content IDs are captured before teardown when available; a runtime pilot must
still verify actual pinned source/image identities, parallel stacks and cleanup.

## 3. GitHub capability and deduplication preflight

These commands require separately authorized GitHub access. They do not grant
publication permission. Use `gh` directly; no extra publisher is installed.
Do not run `gh auth token`, dump environment variables or copy auth output into
evidence. Test authentication without printing it:

```sh
gh auth status >/dev/null 2>&1
gh repo view --json nameWithOwner,visibility,viewerPermission
```

Confirm the intended owner/repository, visibility and adequate permission with a
human. Read-only permission is sufficient for diagnosis; write capability is not
authorization. Use the manifest's `finding_key` as `KEY` below, and the reviewed
`nameWithOwner` as `OWNER/REPO` (shell variables contain metadata, never tokens):

```sh
gh issue list --repo OWNER/REPO --state all --search "$KEY" --limit 100
gh pr list --repo OWNER/REPO --state all --search "$KEY" --limit 100
```

Review open **and closed** matches and verify the full marker in bodies before
creation. Link/update the existing finding rather than duplicate; a closed issue
recurrence needs human triage, not automatic reopening. Search truncation,
unavailable search or ambiguous repository identity is a publication blocker.
Stage `<!-- finding-key: KEY -->` with safe revision/profile and reproduction in
a local issue proposal first. Security-sensitive findings follow `SECURITY.md`,
not public issues.

The existing scheduled browser failure producer now uses a persistent
`kaiten-nightly-v1-…` key for the failing job set. It searches open/closed bodies,
links recurrences, refuses incomplete searches, and retains the original
schedule/permission scope. It is not a second repair/issue producer. Existing
workflow/ref concurrency limits overlapping workflow runs; search followed by
creation is not an atomic GitHub operation, and search indexing can lag. Do not
run another producer concurrently; manually reconcile duplicates if one occurs.
Closed findings are linked, never automatically reopened. Old daily issues have
no key: manually link them at first triage; do not bulk mutate them.

## 4. Fix, independently review, then explicitly publish

After agreeing the issue proposal and change scope, use one owned branch only
when branch/commit actions are authorized. Add a regression test, reproduce the
baseline, implement one narrow fix, run selected checks plus the full applicable
CI matrix, and review the diff for unrelated work, secret exposure and license
attribution. Obtain independent review and **human approval before committing or
publishing**. DCO `Signed-off-by` remains mandatory for every commit.

Dependency additions, migrations, generated contracts, infrastructure and
identity/auth/trust-boundary changes require explicit approval before editing.
Keep expected/actual, failing baseline, regression test, verification outcomes
(including blocked/skipped), compatibility/migration risks and sanitized artifact
links in both staged issue/PR bodies. Do not claim unrun runtime checks passed.

Only with explicit authorization for each write: publish the reviewed issue
body (`gh issue create --repo OWNER/REPO --body-file <local-body> ...`), push the
approved owned branch, then open a **draft-only** linked PR (`gh pr create --draft
--repo OWNER/REPO --body-file <local-body> ...`). Fill required titles/base/head
from the reviewed proposal, never guessed metadata. If a matching finding exists,
link it rather than create another issue. No auto-merge, release, deployment or
persistent event loop. A manual synthetic pilot must succeed before discussing
scheduling or credential persistence; this implementation does not run that pilot.
