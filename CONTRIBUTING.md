# Contributing to Kaiten

Thank you for helping. This file is the short path from a clone to a pull request.
The [README](./README.md) is the authoritative guide to running the stack and is not
repeated here.

Unless a repository or component explicitly states otherwise, Kaiten's
open-source code is licensed under the
[Apache License, Version 2.0](./LICENSE).

By submitting a contribution for inclusion in Kaiten, you agree that the
contribution is submitted under the terms of the project's Apache-2.0 license,
consistent with Section 5 of that license, and you certify your contribution
under the [Developer Certificate of Origin 1.1](#developer-certificate-of-origin)
("DCO").

## Before you open a pull request

Run the part of this list that matches what you changed. It is the one checklist:
the pull request template and the `pr-check` skill point here.

- **Frontend (`app/`).** From `app/`, run:

  ```bash
  pnpm run check:ci
  ```

  It runs the checks of `.github/workflows/app-ci.yml` in the same order: lint, type
  check of the app and of the E2E suite, architecture boundaries, E2E scenario
  contracts, i18n parity and keys, API error translations, source file sizes, token contrast,
  unit tests and a production build. Two things stay outside it:

  - Storybook tests need a browser: `pnpm exec playwright install chromium` once,
    then `pnpm run test:stories`.
  - The Playwright E2E suites run in CI (`.github/workflows/app-e2e.yml`); locally,
    `VISUAL_TESTS=true pnpm run test:e2e` runs the Storybook suite (every test is
    skipped without the variable) and `pnpm run test:e2e:app` the application suite.

  CI also tests and compiles the CEL engine to WebAssembly (`pnpm run
  test:cel-engine`, then `app/cel-engine/build.sh`, then `pnpm run
  test:cel-engine:smoke`; they need Rust and `wasm-pack`). `check:ci` skips those
  steps: the app loads the module at run time, so the bundle builds without it.

  Formatting is not part of `check:ci`, and no workflow checks it: `pnpm run fmt`
  applies the formatter to `src` and `e2e`, and `pnpm run fmt:check` only reports.

- **Backend (`api/`).** From the repository root:

  ```bash
  task lint:api   # golangci-lint on both Go modules, with --fix
  task test:api   # go test -shuffle=on; the integration tests need Docker
  ```

  Then regenerate what your change touches and commit the result. `task generate`
  does not run sqlc or gqlgen, so the first two cases below need their own task.

  - A SQL query: `task generate:sqlc`.
  - The GraphQL schema: `task generate:gqlgen`, then `pnpm run generate` in `app/`
    for the client types.
  - An HTTP operation: `task generate` (it runs `task generate:oas`, then
    `pnpm run generate` in `app/`), and commit what it regenerates:
    `app/openapi.yaml`, `app/platform-openapi.yaml` and
    `app/src/lib/api/scopes.gen.ts`.

  CI regenerates the sqlc and gqlgen output (`codegen` job of `go-ci.yml`) and fails
  when it differs from what you committed. If you changed Go dependencies, run
  `task vuln:api` as well.

- **Design tokens (`packages/theme`).** From `packages/theme`, run the four checks of
  `.github/workflows/theme-ci.yml`:

  ```bash
  pnpm run check
  pnpm run check:stripped-css
  pnpm run check:pack
  pnpm run check:theme-drift
  ```

  `check:ci` does not run them. A change to a token's value, name or presence also
  needs a version bump (`check:theme-drift` fails without one) and a `CHANGELOG.md`
  entry. Details in
  [`packages/theme/CONTRIBUTING.md`](./packages/theme/CONTRIBUTING.md#checks).

- **Helm charts (`charts/`).** `task test:charts` lints and renders both charts
  (it needs `helm`, not a cluster).

- **Documentation.** If your change alters what a feature does or how it is built,
  update that feature's README (`app/src/features/<name>/README.md`), and the page
  of `app/docs/` that covers a convention you touched.

- **Commits.** Follow [Conventional Commits](#commit-messages), and sign off each
  commit with `git commit -s` (see
  [Developer Certificate of Origin](#developer-certificate-of-origin)).

`task --list` shows every task.

## Setting up

You need a Task runner, Docker with the Compose plugin, Go, Node and pnpm. Then
follow the README's [Quickstart](./README.md#quickstart): copy `.env.example` to
`.env`, and `task dev` starts the stack and the frontend.

### macOS

Follow the README's [Prerequisites](./README.md#prerequisites) as written: they are
the Homebrew commands.

### Linux

Install the same tools with your distribution's tooling:

- [Task](https://taskfile.dev/installation/).
- Docker Engine with the Compose plugin. The Taskfile calls `docker compose`.
- Go, at the version `api/go.mod` declares.
- Node, at the major version in `app/.nvmrc`, installed with
  [nvm](https://github.com/nvm-sh/nvm): `task app` runs `nvm use`. If you manage Node
  another way, run by hand what the `app` task in `Taskfile.yml` runs.
- pnpm, through Corepack: `corepack enable`. Corepack takes the version from the
  `packageManager` field of `package.json`.
- [pre-commit](https://pre-commit.com/), for the git hooks below.

### Windows

Use WSL 2 and work inside the Linux distribution, following the Linux steps. The
Taskfile and the repository's scripts call `id -u`, `nvm` and shell scripts, so they
expect a POSIX shell. `docker compose` has to work from the WSL shell.

### Frontend tooling without the backend stack

To install, type-check and test `app/` or `packages/theme` with no Docker and no Go:

```bash
pnpm install                    # at the repository root; builds the theme's dist/
cd app && pnpm run generate     # API SDK and GraphQL client, from the committed contract
```

`app/src/api-client` is generated and not committed, so run `pnpm run generate` on a
fresh clone and again whenever `app/openapi.yaml` or a GraphQL schema changes.

That is enough for the type check, the unit tests and the Storybook tests. The
console itself needs an API to talk to: see
[frontend only](./app/docs/00-getting-started/setup.md#frontend-only).

### Git hooks

```bash
pre-commit install
```

`.pre-commit-config.yaml` declares the hooks and the stage each one runs at. On commit:
whitespace and YAML checks, the size of added files, a guard against tracked
generated secret files (`dev/tokens.json`, `dev/platform-token`), `gofumpt`, the API
error declarations and the commit message check. On push: `golangci-lint`, which needs `golangci-lint` on your `PATH`,
and the API error translations check, which needs the `app/` dependencies. CI runs
the commit-stage hooks on the files of a pull request; `pre-commit run --files <files>`
does the same locally.

## Where things are documented

| Where | What it holds |
| --- | --- |
| [`README.md`](./README.md) | Running the stack, the task list, the environment, authentication |
| [`app/docs/`](./app/docs/README.md) | The frontend: architecture, conventions, patterns, testing, deployment |
| `app/src/features/<name>/README.md` | One feature: what it does and how it is built |
| [`AGENTS.md`](./AGENTS.md) | Layout, commands, rules and checks, for coding agents and for people |
| [`packages/theme/CONTRIBUTING.md`](./packages/theme/CONTRIBUTING.md) | The design tokens package |
| [`SECURITY.md`](./SECURITY.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md), [`TRADEMARKS.md`](./TRADEMARKS.md) | Reporting a vulnerability, the rules of the community, the use of the Kaiten name and logos |

## Reporting a bug or proposing a change

Use the [issue forms](https://github.com/kaitencloud/kaiten/issues/new/choose): one
for a bug report, one for a feature request. For a bug, give the version or commit
you run, the steps that reproduce it and the relevant logs, with tokens and secrets
removed. For a larger change, please open an issue before writing the code, so the
direction is agreed before you spend the time.

Do not disclose an unpatched vulnerability through a public issue: follow
[SECURITY.md](./SECURITY.md).

## Pull requests

Open the pull request against `main` and fill in the template. Keep it to one
change, and attach screenshots or a short recording for a visible UI change. CI runs the workflows that match the paths you touched: `app-ci.yml` and
`app-e2e.yml` for the frontend, `go-ci.yml` for the API, `charts-ci.yml` for the
charts, `theme-ci.yml` for the theme, and `pre-commit-ci.yml` on every pull request.

A pull request should explain:

- what changed;
- why it changed;
- how it was tested;
- any compatibility or migration impact;
- any new third-party dependency or attribution requirement.

For every contribution:

- add or update tests when behavior changes;
- update documentation when relevant;
- do not include secrets, credentials, customer data, or confidential material;
- do not submit code, documentation, assets, data, or other material that you
  do not have the right to contribute;
- identify third-party material and preserve any required license or attribution
  notices.

All required CI checks, including the DCO check, must pass before merge.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/),
checked by [commitlint](https://commitlint.js.org/) with the
`@commitlint/config-conventional` preset (`commitlint.config.cjs`). Format:

```
<type>(<scope>): <description>

feat(api): add license entitlement endpoint
fix(instances): retry on transient usage-report failures
chore(charts): bump chart version
```

The types are `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`,
`perf`, `style` and `revert`. The scope is optional: the part of the repository
(`app` for the console, `api`, `charts`, `theme`) or a narrower module, such as
`instances`. Explain why in the body when the header cannot.

The check runs as a `commit-msg` hook once you have run `pre-commit install`
(`pre-commit install --hook-type commit-msg` installs that hook alone).

Sign off each commit: `git commit -s` appends the `Signed-off-by` trailer that
the [Developer Certificate of Origin](#developer-certificate-of-origin) asks for.

## Developer Certificate of Origin

Kaiten uses the Developer Certificate of Origin 1.1 rather than a Contributor
License Agreement.

The DCO is a lightweight certification that you wrote the contribution, or
otherwise have the right to submit it under the project's open-source license.

The complete DCO text is available in [DCO.md](./DCO.md).

Each commit in a pull request must contain a `Signed-off-by` trailer matching
the commit author.

The easiest way to add it is:

```bash
git commit -s -m "fix(api): describe your change"
```

This creates a trailer such as:

```text
Signed-off-by: Jane Doe <jane@example.com>
```

The `-s` flag is a DCO sign-off. It is different from cryptographically signing
a commit with `git commit -S`.

### Fixing a missing sign-off

If the most recent commit is missing a sign-off:

```bash
git commit --amend --signoff --no-edit
git push --force-with-lease
```

For several commits, `git rebase --signoff <base>` adds the trailer to every
commit of the branch after `<base>`; push the result with `--force-with-lease`.
An interactive rebase that amends the affected commits works too, as do the
remediation instructions supplied by the repository's DCO check.

Do not add another person's sign-off unless you are authorized to certify the
contribution on their behalf under the DCO.

## Employer or organization-owned contributions

If your employer or another organization owns intellectual-property rights in
your work, you are responsible for confirming that you are authorized to
contribute it to Kaiten under Apache-2.0 and to make the DCO certification.

The DCO does not override your employment agreement or another party's
intellectual-property rights.

## Contribution licensing

Kaiten follows a license-in / license-out model for the open-source project:

- the Kaiten open-source core is distributed under Apache-2.0;
- accepted contributions to that core are contributed under Apache-2.0;
- contributors retain any copyright they hold in their original contributions;
- KAITEN INC and all other recipients receive the rights granted by Apache-2.0.

Kaiten may also offer hosted services, support, integrations, or separate
commercial software. Those offerings do not change the Apache-2.0 license
applicable to the open-source Kaiten code.

## Third-party dependencies and copied material

Before introducing a dependency or copying third-party code, assets, examples,
schemas, documentation, or generated material, verify that its license is
compatible with the way Kaiten is distributed.

Preserve all required copyright, license, attribution, and NOTICE information.
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) says when an entry belongs
there.

Do not assume that material found publicly online is available for inclusion in
an Apache-2.0 project.

## AI-assisted contributions

You remain responsible for the provenance and licensing of all material you
submit, including material created with AI-assisted development tools.

Do not submit generated code or content when you cannot reasonably establish
that you have the right to contribute it under the project's terms.

## Releasing

Releases are made by maintainers. A contribution needs no tag, and no version bump
either, except a change to the design tokens, which bumps `@kaitencloud/theme`: see
[`packages/theme/CONTRIBUTING.md`](./packages/theme/CONTRIBUTING.md).

To release, push **one** tag. Every tag-triggered release workflow watches the same
pattern (`[0-9][0-9].[0-9][0-9].[0-9]*` — year, month, patch), so a single tag fans
out to all of them:

```bash
git tag 26.08.3
git push origin 26.08.3
gh run list --repo kaitencloud/kaiten     # watch them
```

That builds and publishes the api, seeder, admin-tools and app images and
the Helm charts. Pre-release suffixes work (`26.08.3-rc.1`), because the pattern
ends in `[0-9]*` and matches anything after the patch digit.

Some artifacts are not on that tag: they publish on a merge to `main` that touches
their sources, as the `on:` block of each `release-*.yml` workflow says. Two examples:

- `@kaitencloud/openapi`, on every merge that touches `app/openapi.yaml`, because
  the contract checks read the spec continuously and would otherwise be a release
  behind the API they check.
- `@kaitencloud/theme`, on a merge that carries a version npm does not have yet
  (`.github/workflows/release-theme.yml`).

## Security issues

Do not disclose an unpatched vulnerability through a public issue.

Please follow [SECURITY.md](./SECURITY.md).

## Code of Conduct

Participation in the Kaiten community is governed by
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Questions

For contribution questions, open a GitHub Discussion or issue in the relevant
Kaiten repository.
