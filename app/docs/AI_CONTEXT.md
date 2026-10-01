# Architecture rules

This page states the rules that shape `app/src`. It is the one place they are written down: the other pages of `app/docs` link here and may give an example, but do not restate a rule. Each rule says what enforces it. Some fail a command (`pnpm run check:architecture`, `pnpm run lint`, `pnpm run check:file-sizes`); the [principles](#principles) are enforced by review only. Run every `pnpm run` command from `app/`.

Where to go next:

- Getting oriented: [getting started](00-getting-started/README.md), the [overview](01-architecture/overview.md) and the [folder structure](01-architecture/folder-structure.md).
- Before a pull request: the checklist in [CONTRIBUTING.md](../../CONTRIBUTING.md#before-you-open-a-pull-request).
- Building a feature: the [feature template](04-features/_template/FEATURE_TEMPLATE.md), [routes as assemblers](03-patterns/routes-as-assemblers.md), [forms](03-patterns/forms.md), [dialog via route](03-patterns/dialog-via-route.md), [query key invalidation](02-conventions/query-key-invalidation.md) and, for a shared widget, [functionals](01-architecture/functionals.md).

## Layers

`app/src` is divided into layers, one folder each. The last column is the direction of dependency between layers. [Import rules](#import-rules) says how it is enforced.

| Layer | Holds | May import |
| --- | --- | --- |
| `lib/` | Infrastructure: API and auth wiring, error handling, i18n, logger, settings, feature-flag evaluation, small utilities. No feature screens or mutations. | `api-client/` |
| `hooks/` | Generic React hooks shared by several features, such as `useAppForm` and `useModal`. | `components/`, `lib/` |
| `components/` | Generic UI: the primitives of `components/ui/`, the form system, dialogs, route error and pending components. No business vocabulary. | `hooks/`, `lib/` |
| `functionals/` | Generic widgets and layouts with non-trivial logic and several independent consumers, such as `page`, `table` and `filters`. No business contract, no API client. | `components/`, `hooks/`, `lib/`, other functionals |
| `domains/` | Business modules shared by several features of one sub-domain: aggregated queries, read models, pure logic, shared forms and components. Never a page or a route. | `api-client/`, `components/`, `functionals/`, `hooks/`, `lib/`, other domains |
| `features/` | One folder per product area. A feature owns its screens, mutations, UI state and schemas, and exposes a route-level `index.ts`. | `api-client/`, `components/`, `domains/`, `functionals/`, `hooks/`, `lib/`, and its own code; never `routes/`, never another feature |
| `routes/` | TanStack Router file routes: thin assemblers that load data and render one feature. `routes/-components/` holds the app shell (side navigation, breadcrumbs). | every layer, through the entry points listed under [Import rules](#import-rules) |
| `api-client/` | The generated REST and GraphQL client. See [Generated code](#generated-code). | generated, not checked |

Where new code goes:

- Code used by one feature stays in that feature. When another feature needs it, it moves to `domains/<name>/` (see "Extract late" under [Principles](#principles)).
- A shared module that carries business slugs, a schema from the API or a network client, a third-party SDK included, belongs in `domains/`, never in `functionals/`, whatever its number of consumers. The check rejects `functionals/` importing `@/api-client`; it does not see npm packages or business slugs, so for those this is a review rule.
- Generic UI without logic goes in `components/`, without a business name in the file or the component. Generic UI with non-trivial logic goes in `functionals/`.
- A domain never owns a page. The route-facing feature keeps the screen, even when the route loads a domain's query options.

## Import rules

`pnpm run check:architecture` enforces the dependency direction in the table above. It is `app/scripts/architecture-rules.ts`, run by `app/scripts/check-architecture.ts`. It reads every TypeScript and JavaScript source file under `app/src` (`.d.ts` files excluded), tests and stories included, and follows `import`, `import type`, `export ... from` and dynamic `import()`, so a type-only import counts like any other. It resolves `@/` and relative specifiers only: npm packages are invisible to it, which is why the restriction on Base UI lives in lint.

Errors fail the command. Warnings are printed and do not; the code has none today, so treat a new one as a mistake.

| Rule | Severity | Forbids |
| --- | --- | --- |
| `component-boundary` | error | `components/` importing `api-client/`, `domains/`, `features/`, `functionals/` or `routes/` |
| `hook-boundary` | error | `hooks/` importing `api-client/`, `domains/`, `features/`, `functionals/` or `routes/` |
| `lib-boundary` | error | `lib/` importing `components/`, `domains/`, `features/`, `functionals/`, `hooks/` or `routes/` |
| `functional-boundary` | error | `functionals/` importing `api-client/`, `domains/`, `features/` or `routes/` |
| `domain-boundary` | error | `domains/` importing `features/` or `routes/` |
| `cross-feature` | error | a feature importing another feature, even for a type |
| `feature-route-boundary` | error | a feature importing `routes/` |
| `feature-root-barrel` | error | importing `features/<name>/index.ts` (`@/features/<name>`) from anywhere but `routes/`, including from the feature itself |
| `feature-local-module` | error | importing `features/feature-flags/rollout`, `targeting` or `variants` from outside `features/feature-flags` |
| `functional-public-api` | error | importing a functional from outside it through anything but `@/functionals/<name>` |
| `internal-relative-import` | warning | a file of a feature, functional or domain importing its own module through an `@/` path |
| `module-public-api` | warning | importing an internal file of another feature or domain (`@/features/<name>/...`, `@/domains/<name>/...`) instead of its `index.ts` |

The public entry points that follow from these rules:

- A feature is imported by routes only, as `@/features/<name>`. Inside a feature, and inside any domain or functional, imports of the module's own files are relative.
- A functional is imported as `@/functionals/<name>`, its `index.ts`. Its internal files are not importable from outside.
- A domain is imported as `@/domains/<name>`, its `index.ts`. Routes may use a domain's query options in a loader.
- The three `feature-flags` submodules are private because the check hard-codes them in `FEATURE_LOCAL_MODULES` (`app/scripts/architecture-rules.ts`). To make another submodule private, add it to that list; nothing else declares it.

`pnpm run lint` enforces three more rules, declared in `app/vite.config.ts` and mirrored in the root `vite.config.ts`. Lint does not scan tests, stories, `src/components/ui/`, the generated `src/api-client/` or `routeTree.gen.ts`.

| Rule | Where | Forbids |
| --- | --- | --- |
| `no-restricted-imports` | `src` and `e2e`, except `src/components/ui/` | importing `@base-ui/**`. Every other file uses the wrappers of `@/components/ui/`, or adds one there. |
| `no-restricted-imports` | `src/routes/**` | importing `useMutation` from `@tanstack/react-query`, or `useState` or `useReducer` from `react`. Under `src/routes/-components/` only `useMutation` is refused: the app shell keeps local state. |
| `unicorn/filename-case` | `src` and `e2e` | file names that are not kebab-case. A leading `_` (`__root.tsx`) and `$param` route files are accepted; directory names are not checked. |

For example, `src/components/ui/slider.tsx` imports `Slider` from `@base-ui/react/slider` and wraps it; `src/features/feature-flags/rollout/components/rollout-percentage-config-sliders.tsx` imports `Slider` from `@/components/ui/slider`.

## Generated code

Never edit these files by hand; regenerate them.

| Files | Regenerate with |
| --- | --- |
| `app/src/api-client/**`, git-ignored: absent after a clone | `pnpm run generate` in `app/`. REST comes from `app/openapi.yaml`, GraphQL from the `.graphqls` schemas under `api/`. |
| `app/src/lib/api/scopes.gen.ts` | `pnpm run generate` in `app/` |
| `app/src/routeTree.gen.ts` | written by the TanStack Router plugin when the dev server or a build runs |
| `app/openapi.yaml`, `app/platform-openapi.yaml` | `task generate:oas` from the repository root, from the Go source |

After a fresh clone, run `pnpm run generate` before the type check or the tests. [api-generation.md](01-architecture/api-generation.md) explains the chain.

- Types, SDK functions, Zod schemas, query options, mutations and query keys come from the generated client under `@/api-client/`: the SDK functions and types from `@/api-client`, the query options, mutations and query keys from `@/api-client/@tanstack/react-query.gen`, the Zod schemas from `@/api-client/zod.gen`. Do not redefine what it generates.
- A form schema starts from the generated Zod schema and extends it, so the two cannot drift.
- An endpoint that the OpenAPI contract does not describe is the one reason to write a client call by hand. Keep it in a `*.api.ts` module of the feature, with local types.

## Principles

These are not enforced by any command. They are reviewed in pull requests, by the `app-architecture-guardian` skill and by the `architecture-reviewer` subagent. Do not present them as checked.

- **Extract late.** A business module stays in its feature until a second independent feature needs it, then moves to `domains/`. A hook moves to `hooks/` when a second feature uses it. A functional is generic and has at least two independent consumers. Two files of the same submodule count as one consumer, and a deliberately generic primitive may be shared earlier. No tool counts consumers.
- **Routes are thin.** A route loads data (`loader` with `ensureQueryData`), reads its params and renders one feature component. Mutations, business logic, data filtering and detailed JSX belong to the feature. Lint blocks only the imports listed above; the rest is review.
- **Small units.** Functions stay under about 100 lines. Only the file limit is enforced (350 lines, see [Checks](#checks)). When a unit grows, extract pure helpers, hooks or sub-components.
- **No anonymous UI callbacks in JSX.** Prefer a named render function or a local sub-component to an inline callback that produces UI, such as a `map` or a complex conditional branch. Render props passed as `children` are fine, notably `form.AppField` and `form.Subscribe` from TanStack Form. Event handlers and data transformations are not concerned.
- **Composition first.** A shared component exposes a root and named sub-components (`Page.Header`, `TableCard.Table`) instead of structural props such as `header`, `footer` or `*ClassName`. See [composition](03-patterns/composition.md).
- **A feature root exports what routes consume.** `features/<name>/index.ts` is the feature's route-level API. The check controls who imports it, not what it exports.

## Checks

Run from `app/`.

| Command | What it verifies |
| --- | --- |
| `pnpm run check:architecture` | The 12 rules of [Import rules](#import-rules): 10 errors and 2 warnings. |
| `pnpm run lint` | Oxlint on `src` and `e2e`, type-aware: correctness rules, the restricted imports and the file names of [Import rules](#import-rules). |
| `pnpm run check:file-sizes` | Every `.ts` and `.tsx` file under `src` has at most 350 lines. Exempt: tests, stories, `__tests__/`, `components/ui/`, `lib/i18n/locales/`, `api-client/`, `routeTree.gen.ts` and `src/e2e/`. |
| `pnpm run typecheck`, `pnpm run typecheck:e2e` | `tsc` for `src` and for `e2e`. |
| `pnpm run check:e2e-contracts` | Every E2E scenario model builds, and its seed passes the API contract validation (`parseContract`). |
| `pnpm run check:i18n-parity` | Every key of the `en` locale exists in `fr`, and the reverse. |
| `pnpm run check:i18n-keys` | Every translation key the code asks for exists in `en`. Keys built at run time are not checked. |
| `pnpm run check:api-error-i18n` | Every API error code has an `Errors.api.<code>` translation. |
| `pnpm run check:ci` | Chains the App CI checks: lint, both type checks, architecture, E2E scenario contracts, i18n parity, i18n keys, API error translations, file sizes, token contrast, unit tests and a production build. |

No command checks the [principles](#principles), the placement rules that need judgment (business slugs, schemas or SDKs in `domains/`, business naming in `components/`) or the conventions below, apart from the file names and the i18n checks.

## Conventions

- Commands: `pnpm run <script>` from `app/`, `task <name>` from the repository root. See [scripts](00-getting-started/scripts.md).
- Names: files in kebab-case (enforced), components and types in `PascalCase`, hooks in `useCamelCase`, constants in `UPPER_SNAKE_CASE`. `@/` is `app/src`.
- Server state lives in TanStack Query: a route `loader` calls `ensureQueryData` and the component reads with `useSuspenseQuery`. Feature UI state lives in TanStack Store, settings persisted in `localStorage` in TanStack DB. When a feature's UI has several coupled transitions, prefer a store with named actions to `useState` plus a synchronising `useEffect`. See [state management](03-patterns/state-management.md).
- Forms use TanStack Form and Zod through `useAppForm` from `@/hooks/form`. Wire the DOM form as `<form onSubmit={createFormSubmitHandler(form.handleSubmit)}>`. A custom handler calls `e.preventDefault()` and `e.stopPropagation()` before `form.handleSubmit()`. See [forms](03-patterns/forms.md).
- After a mutation, invalidate with the generated query key functions, such as `listReleasesQueryKey()`, not hand-written arrays. An entity read through both REST and GraphQL needs both keys invalidated. See [query key invalidation](02-conventions/query-key-invalidation.md).
- A small create or edit form opens in a dialog controlled by the route ([dialog via route](03-patterns/dialog-via-route.md)). A long or multi-step flow gets a full page, as `/releases/new` and `/feature-flags/new` do.
- UI primitives and their wrappers live in `@/components/ui/`; class names merge with `cn` from `@/lib/utils`.
- User-visible text goes through i18n. Add each key to both `app/src/lib/i18n/locales/en.ts` and `fr.ts`. See [i18n](02-conventions/i18n.md).
- An API error becomes a user-facing message with `getApiErrorMessage` from `@/lib/errors`, usually passed to `toast.error`. See [error handling](02-conventions/error-handling.md).
