# Features

Each folder here is one product area of the console. A feature owns its screens, its mutations, its UI state and its form schemas, and its `index.ts` is the API that routes import.

- The [features table](../../docs/04-features/README.md) lists every feature with its routes and a link to its README.
- Each feature documents itself in its own `README.md`, at the root of its folder.
- The [feature template](../../docs/04-features/_template/FEATURE_TEMPLATE.md) gives the structure of a feature and the model of its README.

Two rules shape a feature. Only routes import `@/features/<name>`, and a feature never imports another feature, not even for a type. What two features share moves to `app/src/domains/`. [Import rules](../../docs/AI_CONTEXT.md#import-rules) states them, and `pnpm run check:architecture` enforces them.

## Tests

The tests of a feature sit with its code. Run every command from `app/`; on a fresh clone, run `pnpm run generate` first, because much of the code imports the generated API client.

| Kind | Where | Run it with |
| --- | --- | --- |
| Unit tests (Vitest, jsdom) | `*.test.ts(x)`, in a `__tests__/` folder or next to the file, anywhere in the feature | `pnpm run test`, or `pnpm run test:watch` |
| Stories (Storybook) | `components/stories/*.stories.tsx`, or the `stories/` folder of a subfolder | `pnpm run test:stories` runs them as tests; `pnpm run storybook` browses them |
| Application E2E (Playwright, API mocked) | `app/e2e/app/<area>/` | `pnpm run test:e2e:app` |
| Visual regression (Playwright) | `app/e2e/tests/visual-regression.spec.ts` | `VISUAL_TESTS=true pnpm run test:e2e` |

- The routes of a feature can carry unit tests too: a `-<name>.test.ts(x)` file next to the route file, such as `app/src/routes/customers/$customerSlug/-edit.test.ts`. The `-` prefix keeps it out of the route tree.
- Some stories are coupled to the router, to the forms or to the API, or pull heavy dependencies such as recharts or the CEL editor. `storybookTestExclude` in `app/vite.config.ts` lists the stories that `test:stories` does not collect. They stay available in Storybook, and an E2E spec also covers some of them.
- The E2E folders are named after an area of the console, not always after a feature: `app/e2e/app/release-management/` covers releases, components and deployment zones.
- Which tests a feature has, and which of its behaviours they cover, is in the `Tests` section of its README. The [testing guide](../../docs/06-testing/README.md) explains how to write each kind.
