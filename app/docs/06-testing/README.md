# 06 - Testing

The console has four kinds of automated tests. They all run from `app/`, and none of them needs the backend stack: Mock Service Worker answers the API, in Node for the unit tests and inside the browser for the end-to-end suite.

| Kind | What it checks | Where it lives | Run it with |
| --- | --- | --- | --- |
| Unit | Logic, hooks and components with behaviour, in jsdom | `src/**/*.test.ts(x)`, `scripts/**/*.test.ts` | `pnpm run test` |
| Storybook | Every story renders, and its `play` function interacts with it and asserts, in Chromium | `src/**/stories/*.stories.tsx` | `pnpm run test:stories` |
| Visual regression | Screenshots of a few stable stories against committed baselines | `e2e/tests/visual-regression.spec.ts` | `VISUAL_TESTS=true pnpm run test:e2e` |
| Application E2E | The real console in Chromium, signed in by bypass, with the API mocked: routes, CRUD, cache refresh, errors | `e2e/app/` | `pnpm run test:e2e:app` |

Unit and Storybook tests are two projects of one Vitest configuration (`test` in `app/vite.config.ts`). The other two are Playwright suites, each with its own config: `app/playwright.config.ts` (Storybook) and `app/playwright.app.config.ts` (application).

## Which test to write

- A pure function, a schema, a store, a hook: a unit test.
- A component whose behaviour needs no router and no server data: a unit test with Testing Library, or a story with a `play` function when its visual states matter too.
- A screen that depends on the router, on mutations and on the refresh of several queries, or a flow across features: an application E2E spec. The stories coupled to those (listed in `storybookTestExclude` in `app/vite.config.ts`) are kept out of `test:stories` for that reason.
- A layout that must not drift pixel by pixel: a visual regression test, and only on a story that is stable.

## Before you run anything

Run these from a fresh clone:

```bash
pnpm install                              # repository root
cd app
pnpm run generate                         # src/api-client is generated and git-ignored
pnpm exec playwright install chromium     # Storybook tests and both Playwright suites
```

- Much of the code under test imports the generated client, so `pnpm run generate` comes before `test`. CI does the same before every test job.
- `test:e2e:app` starts its own dev server on port 3100 and fails if something already listens there. `test:e2e` uses port 6006 for Storybook, and reuses a Storybook that is already running when it does not build a static one.
- Docker is needed by one script only, `test:e2e:visual:update:linux`, which rewrites the visual baselines.

## Scripts

[Scripts](../00-getting-started/scripts.md) lists every one. The ones you use most:

| Script | What it does |
| --- | --- |
| `pnpm run test` | Unit tests, once. |
| `pnpm run test:watch` | Unit tests in watch mode. |
| `pnpm run test:stories` | Storybook tests, once. |
| `pnpm run test:e2e:app` | The application suite. |
| `pnpm run test:coverage` | Unit tests with coverage. |
| `pnpm run test:coverage:combined` | Unit coverage, then E2E coverage, merged. |
| `pnpm run check:ci` | The App CI checks, with the unit tests. It does not run the Storybook tests or the Playwright suites. |

## In this section

- [Unit tests](./unit-tests.md): where they live, how to write and run one.
- [Integration tests](./integration-tests.md): the Storybook tests, the visual regression suite, the application suite and the mocked API behind it.
- [Coverage](./coverage.md): what is collected, how the unit and E2E figures are combined, and what is not enforced.
- [`app/e2e/README.md`](../../e2e/README.md): the layout of `e2e/` and the rules for writing an E2E spec.
- [`app/e2e/AI_E2E_GUIDE.md`](../../e2e/AI_E2E_GUIDE.md): prompts and templates for writing E2E specs with an AI assistant.
- [CI/CD](../07-deployment/ci-cd.md): which workflow runs which suite.
