# Frontend documentation

Documentation of the React console in `app/`: how it is built, the rules its code
follows, the patterns to reuse, how to test and deploy it.

It covers the frontend only. The Go API is in `api/`, the Helm charts in `charts/`,
and the local Docker stack in `compose.yml` and `docker/`; the root
[README](../../README.md) describes them.

## Contributing

- [README](../../README.md) at the repository root: run the whole local stack with
  `task dev`, the task list, authentication, environment.
- [CONTRIBUTING.md](../../CONTRIBUTING.md): the checklist to run before a pull
  request, commit messages, git hooks, how to report a bug.
- [AGENTS.md](../../AGENTS.md): layout, commands, rules and checks in one page,
  for coding agents and for people.
- [Setup](./00-getting-started/setup.md): the frontend-only path, if you do not
  want the Go toolchain (it still needs Docker and `task up` for the backend).
- [`app/README.md`](../README.md): the console at a glance.

## Reading order

1. [Setup](./00-getting-started/setup.md) and [Scripts](./00-getting-started/scripts.md):
   run the console and learn the commands.
2. [AI_CONTEXT.md](./AI_CONTEXT.md): the architecture rules on one page. Every other
   page links here instead of restating them.
3. [Architecture overview](./01-architecture/overview.md),
   [folder structure](./01-architecture/folder-structure.md) and
   [functionals](./01-architecture/functionals.md): where code lives and what may
   import what.
4. [Conventions](./02-conventions/README.md), starting with
   [code style](./02-conventions/code-style.md) and [i18n](./02-conventions/i18n.md).
5. [Patterns](./03-patterns/README.md), then
   [routes as assemblers](./03-patterns/routes-as-assemblers.md).
6. [Features](./04-features/README.md): the entry table, then the README of the
   feature you work on.
7. [Components](./05-components/README.md), [testing](./06-testing/README.md) and
   [deployment](./07-deployment/README.md), when the task needs them.
8. [Glossary](./glossary.md), whenever a term is unclear.

## Index

### 00 - Getting started

- [README](./00-getting-started/README.md): entry point of the section.
- [Setup](./00-getting-started/setup.md): prerequisites, the two ways to run the
  console, environment variables.
- [Scripts](./00-getting-started/scripts.md): every `pnpm run` script of `app/`.
- [Tech stack](./00-getting-started/tech-stack.md): libraries and tools, with
  versions and roles.

### 01 - Architecture

- [README](./01-architecture/README.md): entry point of the section.
- [Overview](./01-architecture/overview.md): how the app is organised: features,
  domains, routing, shared components, API layer, state.
- [Folder structure](./01-architecture/folder-structure.md): what each folder of
  `src/` holds, and the dependency matrix.
- [Functionals](./01-architecture/functionals.md): reusable UI widgets, and when to
  create one.
- [Data flow](./01-architecture/data-flow.md): how reads, writes and authentication
  flow through the app.
- [API generation](./01-architecture/api-generation.md): how the REST and GraphQL
  clients are generated and used.
- [API contract](./01-architecture/api-contract.md): the REST and GraphQL contracts
  the console consumes, and where they come from.

### 02 - Conventions

- [README](./02-conventions/README.md): entry point of the section.
- [Code style](./02-conventions/code-style.md): tooling, React rendering, file size,
  imports, exports, UI spacing.
- [Error handling](./02-conventions/error-handling.md): how REST, GraphQL and network
  errors become one error type and reach the user.
- [Git workflow](./02-conventions/git-workflow.md): branches, commits and pull requests.
- [Internationalisation](./02-conventions/i18n.md): translation files, keys, parity.
- [Query key invalidation](./02-conventions/query-key-invalidation.md): refreshing
  TanStack Query caches after a mutation.

### 03 - Patterns

- [README](./03-patterns/README.md): entry point of the section.
- [Composition](./03-patterns/composition.md): slots and sub-components instead of
  long prop lists.
- [Detail cards](./03-patterns/detail-cards.md): layout of the cards on a detail page.
- [Dialog via route](./03-patterns/dialog-via-route.md): dialogs that have their own URL.
- [Forms](./03-patterns/forms.md): TanStack Form, Zod schemas, create and edit modes.
- [Page scrolling](./03-patterns/page-scrolling.md): the `Page` layout, with a fixed
  header and scrolling content.
- [Routes as assemblers](./03-patterns/routes-as-assemblers.md): routes stay thin and
  assemble what features provide.
- [State management](./03-patterns/state-management.md): server state, feature UI
  state, ephemeral state.
- [Stats cards](./03-patterns/stats-cards.md): KPI cards.
- [Tables](./03-patterns/tables.md): data tables, columns, row actions.

### 04 - Features

- [README](./04-features/README.md): an entry table of the features.
- The documentation of a feature lives with its code, in
  `app/src/features/<name>/README.md`.
- [`_template/`](./04-features/_template/): the template for a new feature and its
  README.

### 05 - Components

- [README](./05-components/README.md): entry point of the section.
- [Form components](./05-components/form-components.md): the building blocks and
  fields of `src/components/form/`.
- [Table components](./05-components/table-components.md): the shared components of
  `src/functionals/table/`.
- [UI components](./05-components/ui-components.md): the primitives under
  `src/components/ui/`.

### 06 - Testing

- [README](./06-testing/README.md): entry point of the section.
- [Unit tests](./06-testing/unit-tests.md): Vitest tests next to the code.
- [Integration tests](./06-testing/integration-tests.md): the Storybook and
  application Playwright suites.
- [Coverage](./06-testing/coverage.md): collecting and combining coverage.

### 07 - Deployment

- [README](./07-deployment/README.md): entry point of the section.
- [CI/CD](./07-deployment/ci-cd.md): the GitHub workflows that check and release the app.
- [Docker](./07-deployment/docker.md): building and running the production image.
- [Environments](./07-deployment/environments.md): the variables the console reads.

### Reference

- [AI_CONTEXT.md](./AI_CONTEXT.md): the architecture rules, with anchors for
  [layers](./AI_CONTEXT.md#layers), [import rules](./AI_CONTEXT.md#import-rules),
  [generated code](./AI_CONTEXT.md#generated-code),
  [principles](./AI_CONTEXT.md#principles), [checks](./AI_CONTEXT.md#checks) and
  [conventions](./AI_CONTEXT.md#conventions).
- [Glossary](./glossary.md): the terms used across the docs.

## Maintenance

A pull request that changes behaviour updates the page of `app/docs/` that covers it,
or the README of the feature it touches (`app/src/features/<name>/README.md`).
Reviewers look for it.

When you write a page:

- Write in English, in the present tense, and say what the code does today.
- Verify a command exists (`app/package.json`, `Taskfile.yml`) before you cite it.
  Scripts run as `pnpm run <script>` from `app/`; tasks run as `task <name>` from the
  repository root.
- Link with relative Markdown links, and name code by its path from the repository
  root.
