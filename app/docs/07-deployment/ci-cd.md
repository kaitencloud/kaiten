# CI/CD

The workflows live in `.github/workflows/`. Three of them concern the app.

| Workflow | Runs on | Purpose |
| --- | --- | --- |
| `app-ci.yml` | Pull requests | Static checks, unit tests, Storybook tests, production build |
| `app-e2e.yml` | Pull requests, pushes to `main`, nightly, manual | Playwright end-to-end suites |
| `release-app.yml` | Pushes to `main`, version tags | Publishes the Docker image |

Two more run on pull requests: `theme-ci.yml` checks `@kaitencloud/theme` when
`packages/theme/**` changes (App CI covers what the tokens do to the console),
and `pre-commit-ci.yml` runs the pre-commit hooks on the files a pull request
changes.

## Which pull requests trigger them

`app-ci.yml` and `app-e2e.yml` run on a pull request whose base branch is
`main`, `feat/**`, `fix/**` or `chore/**`, and only when it touches `app/**`,
`packages/theme/**`, the root `package.json`, `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `.npmrc` or the workflow itself. `app-e2e.yml` also
watches `.github/actions/setup-app-e2e/**`. A new push cancels the previous run
of the same workflow on the same ref.

## App CI (`app-ci.yml`)

| Job | What it runs |
| --- | --- |
| `lint_typecheck` | `generate`, then `lint`, the app type check (`tsc --noEmit`), `typecheck:e2e`, `check:architecture`, `check:e2e-contracts`, `check:i18n-parity`, `check:i18n-keys`, `check:api-error-i18n`, `check:file-sizes`, and `scripts/check-token-contrast.mjs` from the repo root |
| `unit` | `generate`, then `test` (the unit tests) |
| `stories` | `generate`, then the Storybook tests (`test:stories`) in 3 shards, after a throwaway warm-up pass that fills the Vite optimizer cache |
| `build` | After `lint_typecheck`: runs the CEL engine crate's tests (`test:cel-engine`, `cargo test --locked`), compiles the engine to WebAssembly (`app/cel-engine/build.sh`, Rust and `wasm-pack`), loads the built module in Node and feeds it half-typed rules (`test:cel-engine:smoke`), then runs the production build |

The names in the table are `app/package.json` scripts. What each architecture
check enforces is in [AI_CONTEXT](../AI_CONTEXT.md#checks).

To run the same checks locally, from `app/`:

```bash
pnpm run generate        # once on a fresh clone: check:ci expects the generated API client
pnpm run check:ci        # everything above except the Storybook tests and the WebAssembly steps
pnpm run test:stories    # needs Chromium: pnpm exec playwright install chromium
pnpm run test:cel-engine # the CEL engine crate's tests; needs Rust
pnpm run build:wasm      # needs Rust and wasm-pack
pnpm run test:cel-engine:smoke  # after build:wasm: loads the built module in Node
```

`check:ci` builds without the WebAssembly module: the app loads it at run time,
so the bundle builds without it.

## App E2E (`app-e2e.yml`)

| Job | What it runs |
| --- | --- |
| `e2e_storybook` | The Storybook suite (`e2e/tests`, `playwright.config.ts`) against a static Storybook build, in 2 shards, inside the Playwright Docker image |
| `e2e_app` | The application suite (`e2e/app`, `playwright.app.config.ts`) against the dev server with mocks, in 3 shards |
| `publish_trace_preview` | When a pull request from this repository fails: builds a preview site from the failed shards' Playwright reports, publishes it to GitHub Pages when Pages is configured (otherwise it stays a run artifact), and comments on the pull request |
| `notify_nightly_failure` | When the nightly run fails: opens a GitHub issue labelled `e2e` and `nightly-failure`, or comments on today's |

The suites also run on every push to `main` that touches the same paths, on
manual dispatch, and every night at 03:00 UTC. Locally, from `app/`:

```bash
VISUAL_TESTS=true pnpm run test:e2e   # Storybook suite (skipped locally without the variable)
pnpm run test:e2e:app                 # application suite
```

See [testing](../06-testing/README.md) for how the suites work.

## Release (`release-app.yml`)

- A push to `main` that touches the app, the theme package, the workspace
  manifests or the workflow builds the image and tags it `latest`.
- A push of a version tag (`YY.MM.patch`, for example `26.09.3`, with an
  optional pre-release suffix) builds it again and tags it with the version. A
  stable version also gets the `YY.MM` tag. A tag always rebuilds the image,
  whatever changed: the path filter only scopes pushes to `main`.
- `build` builds `linux/amd64` and `linux/arm64` on native runners from
  `app/Dockerfile` with the repository root as context, and pushes each image
  by digest. `merge` assembles the multi-arch manifest and pushes the tags to
  `ghcr.io/kaitencloud/app`. The Dockerfile compiles the CEL engine to
  WebAssembly in its own stage, so each platform's job builds it for itself (see
  [Docker](./docker.md#build)).
- The build passes no build arguments: the image is neutral and reads its
  configuration when the container starts (see [Docker](./docker.md)).
- A `declare` job runs after `merge`, for version tags pushed to
  `kaitencloud/kaiten` only. It is skipped on forks.

Maintainers cut a release by pushing one tag; a contribution needs no tag. The
procedure is in [CONTRIBUTING](../../../CONTRIBUTING.md#releasing).
