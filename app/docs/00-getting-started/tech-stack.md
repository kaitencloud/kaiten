# Tech stack

What the console is built with, and where each piece is used. Versions are the
ranges declared in [`app/package.json`](../../package.json) and in the `catalog:`
block of [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml); the lockfile pins the
exact ones. When a version here and the manifest disagree, the manifest is right.

## Application

| Piece | Version | Role |
| --- | --- | --- |
| React | 19 | UI library. |
| TypeScript | 7 (`~7.0.2`) | Language. `packages/api-codegen` stays on 6 (`~6.0.3`) because the REST generator needs the JavaScript compiler API that TypeScript 7 no longer has. |
| TanStack Router | 1 | File-based routing. The route tree is generated into `src/routeTree.gen.ts` by the router plugin. |
| TanStack Query | 5 | Server state: every API read and mutation. |
| TanStack Table | 9 | Table state and rendering, behind the `functionals/table` widgets. |
| TanStack Form and Zod | 1 and 4 | Forms and their validation schemas. |
| TanStack Store | 0.11 | Client UI state scoped to a feature (dialog and wizard stores). |
| TanStack DB | 0.4 | Local settings (theme, language, side navigation) persisted in `localStorage`. |
| i18next and react-i18next | 26 and 17 | Translations, English and French (`src/lib/i18n/locales`). |
| Clerk (`@clerk/react`, `@clerk/ui`) | 6 and 1 | Sign-in when the app does not run with `VITE_LOCAL_AUTH`. See [Setup](./setup.md#sign-in-with-clerk). |
| OpenFeature web SDK and OFREP web provider | 1 and 0.4 | Feature flags the console reads over OFREP (`src/lib/feature-flags.ts`). |

## Interface

| Piece | Version | Role |
| --- | --- | --- |
| Tailwind CSS | 4 | Styling, through `@tailwindcss/vite`. The design tokens come from the workspace package `@kaitencloud/theme` (`packages/theme`). |
| Base UI | `@base-ui/react` 1 | Headless primitives through shadcn/ui's `base-vega` components. Imported only from `src/components/ui/`, which `pnpm run lint` enforces. |
| shadcn | 4 (CLI) | Adds and updates the components of `src/components/ui/` (`components.json`). |
| Sonner, react-day-picker | 2, 10 | Toasts, date pickers. |
| Lucide | 1 | Icons. |
| Recharts | 3 | Charts. |
| dnd-kit | 6 and 10 | Drag and drop, for the sortable targeting rules. |
| CodeMirror, Monaco Editor | `@uiw/react-codemirror` 4, `monaco-editor` 0.55 | CodeMirror for JSON fields, Monaco for the CEL rule editor. |
| `cel-js` and the CEL engine | `cel-js` 0.8 | `cel-js` parses expressions for the CEL formatter. A Rust engine compiled to WebAssembly (`app/cel-engine`) gives the editor its local syntax check. |
| Ajv | 8 | Validates metadata values against their JSON Schema (draft 2020-12). |
| PapaParse, date-fns | 5 and 4 | CSV export and date handling. |

## API client

| Piece | Version | Role |
| --- | --- | --- |
| Hey API (`@hey-api/openapi-ts`) | 0.99 | Generates the REST client, types, Zod schemas and TanStack Query options from `app/openapi.yaml` into `src/api-client`, through `packages/api-codegen`. |
| GraphQL Code Generator | 7 (CLI), 6 (client preset) | Generates the typed GraphQL client into `src/api-client/graphql`. |

See [API generation](../01-architecture/api-generation.md) for the flow.

## Build, lint and test

| Piece | Version | Role |
| --- | --- | --- |
| Vite+ (`vp`) | 1 | The toolchain: bundles Vite, Vitest, Oxlint and Oxfmt behind one command. Configured in `app/vite.config.ts`. |
| Oxlint and Oxfmt | Bundled with Vite+ | Lint (type-aware) and formatting. |
| Vitest | 5 | Unit tests (jsdom) and story tests (Chromium). The version is pinned to the one Vite+ ships. |
| Testing Library | react 16, user-event 14 | Component tests. |
| Storybook | 10 | Component workshop and story tests (`@storybook/addon-vitest`). |
| Playwright | 1 | End-to-end and visual-regression suites. |
| MSW | 2 | Mocked network for the application E2E suite (`src/e2e/msw`). |
| tsx | 4 | Runs the TypeScript check scripts of `app/scripts/`. |

## Packaging

The production image is built from [`app/Dockerfile`](../../Dockerfile): a Rust
stage that compiles the CEL engine to WebAssembly, a Node 24 build stage, then
nginx 1.26 serving `dist/` on port 8080. See [Docker](../07-deployment/docker.md).
