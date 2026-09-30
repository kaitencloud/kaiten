# Coverage

Coverage is informational. No threshold is configured, and CI does not collect it: no job fails on a low number, and none publishes one. Use the reports to see which files a test suite reaches, not as a gate.

What the project asks of a change is enforced by review, not by a tool:

- New business logic comes with a unit test.
- A workflow that matters comes with a test in the suite that fits it: a story with a `play` function for an isolated component, an [application E2E spec](./integration-tests.md#application-e2e-e2eapp) for a flow across routes or a mutation.

## Unit coverage

```bash
pnpm run test:coverage       # the unit project
pnpm run test:all:coverage   # the unit and Storybook projects
```

Vitest measures with V8 and writes a text summary to the terminal and JSON and HTML reports to `app/coverage/` (git-ignored). The coverage configuration in `app/vite.config.ts` leaves these out:

- `node_modules`, `dist`, the generated `api-client/` and `routeTree.gen.ts`;
- `e2e/`, `__tests__/` and `*.stories.tsx`;
- `src/components/ui/`, the wrappers over third-party primitives;
- `routes/`, which the Storybook and Playwright suites exercise.

## E2E coverage

```bash
pnpm run test:e2e:coverage:app
```

The script:

1. deletes the previous E2E and combined output (`coverage:e2e:clean`);
2. runs the application suite with `E2E_COVERAGE=true`, on Chromium only (the browser coverage API is Chromium-only) and with one worker;
3. merges the result with the unit report (`coverage:merge`).

With `E2E_COVERAGE=true`, the `test` that specs import from `e2e/app/_support/app-test.ts` starts V8 JavaScript and CSS coverage on the page before each test. It writes one JSON file per test to `app/.coverage/e2e/raw/`, keeping only the files under `src/` and dropping `src/api-client/`, `src/components/ui/` and `routeTree.gen.ts`.

## Combined report

```bash
pnpm run test:coverage:combined
```

This runs `test:coverage`, then `test:e2e:coverage:app`, and writes:

- `app/.coverage/combined/coverage-summary.json`, with the totals and one entry per file;
- `app/.coverage/combined/coverage-summary.md`, the totals and the 30 files touched by E2E with the lowest E2E line coverage.

`coverage:merge` reads `coverage/coverage-summary.json` if it exists, otherwise `coverage/coverage-final.json`. Without a unit report it still runs, and the unit figures are empty. That is why `pnpm run test:e2e:coverage:app` can run alone: it merges with whatever unit report `coverage/` holds.

Read the figures with these limits in mind:

- **Two measures.** The unit figure counts lines from Vitest's statement coverage of the source. The E2E figure counts the non-blank, non-comment lines of the JavaScript the browser loaded that a V8 range marks as executed. They are not the same measure.
- **Combined is a maximum.** For each file the combined figure is the larger of the unit and E2E covered-line counts, not the union of the lines each suite reaches, so it can understate the coverage the two suites reach together.
- **What E2E shows.** It shows which application files the E2E flows traverse. The unit report stays the precise one for logic.

The directories can be moved with `E2E_COVERAGE_DIR` (raw E2E files), `COVERAGE_COMBINED_DIR` (the combined output) and `UNIT_COVERAGE_PATH` (the unit report to merge).
