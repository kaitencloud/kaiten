# Code style

[Conventions](../AI_CONTEXT.md#conventions) in `AI_CONTEXT.md` lists the naming rules,
[Import rules](../AI_CONTEXT.md#import-rules) the dependency rules, and
[Checks](../AI_CONTEXT.md#checks) the commands that enforce them. This page covers what
the formatter and the linter do, and the style points those pages leave out. It says
for each rule whether a tool checks it. Run the commands from `app/`.

## Tooling

- **Formatter and linter.** Vite+ runs Oxfmt and Oxlint (type-aware). The scripts are
  `pnpm run fmt`, `fmt:check`, `lint`, `lint:fix`, `check` and `check:fix`; see
  [scripts](../00-getting-started/scripts.md).
- **Configuration.** `app/vite.config.ts` is the configuration that `pnpm run lint` and
  `pnpm run fmt` use from `app/`. The root `vite.config.ts` repeats it for a bare `vp`
  command run from the repository root. Change both together.
- **Formatting.** 80 columns, single quotes, two spaces. `pnpm run fmt` only reaches
  the TypeScript and JavaScript files of `src` and `e2e`, never Markdown, JSON or CSS,
  and it leaves alone the generated `src/api-client/`, `src/components/ui/`,
  `routeTree.gen.ts`, `src/styles.css`, tests, stories and every `*.queries.ts` file.
- **Linting.** Oxlint runs its `correctness` rules as errors (plugins `typescript`,
  `react`, `unicorn` and `oxc`, a few rules switched off in `vite.config.ts`), plus
  the three project rules of [Import rules](../AI_CONTEXT.md#import-rules): restricted
  imports of Base UI, the restrictions on routes, and kebab-case file
  names. It skips tests, stories, `src/components/ui/`, `src/api-client/` and
  `routeTree.gen.ts`.
- **TypeScript.** `tsconfig.json` sets `strict`, `noUnusedLocals`,
  `noUnusedParameters` and `verbatimModuleSyntax`. With the last one, an import that
  only brings a type must say so, with `import type { X }` or `import { type X }`,
  or `pnpm run typecheck` fails.

## Names

- **Files** are kebab-case, and lint fails otherwise. A leading `_` (`__root.tsx`) and
  `$param` route files (`$connectorId.tsx`) are accepted, directory names are not
  checked, and lint does not scan tests, stories or `components/ui/`.
- **Components and types** are `PascalCase`, **hooks** `useCamelCase`, and a fixed
  value is `UPPER_SNAKE_CASE` (`MAX_PAGE_SIZE` in `app/src/lib/api/pagination.ts`).
  Query keys and query options are camelCase, like other values
  (`licensesWithInstancesBaseQueryKey`). No tool checks these.
- A file is named after what it exports: `ConnectorsIndex` is in `connectors-index.tsx`
  and `useDeleteReleaseMutation` in `use-delete-release-mutation.ts`.
- Some suffixes carry a meaning: `*.test.ts(x)` and `*.stories.tsx` for tests and
  stories, `*.queries.ts` for GraphQL documents, and `*.api.ts` for the client calls
  that a feature writes itself, notably for an endpoint that the contract does not
  describe (see [API generation](../01-architecture/api-generation.md)). The formatter
  skips every file with the `*.queries.ts` suffix, so keep the suffix for those
  documents. `app/src/features/settings/metadata-fields/metadata-fields.queries.ts`,
  which holds TanStack Query options and no `graphql()` document, is the one
  exception to that naming rule.

## Rendering collections and branches

A callback written inline in JSX that returns UI (a `map`, a complex conditional
branch) is replaced by a named render function or a sub-component. No tool checks this
[principle](../AI_CONTEXT.md#principles), and some existing code still maps inline;
new code follows it.

```tsx
// app/src/features/connectors/components/connectors-index.tsx (abridged)
function renderCard(connector: ConnectorMeta) {
  return (
    <ConnectorCard
      key={connector.id}
      connector={connector}
      onPrimary={primaryHandler(connector)}
    />
  );
}

return <ConnectorGrid>{crm.map(renderCard)}</ConnectorGrid>;
```

Instead of `crm.map((connector) => (<ConnectorCard ... />))` in the JSX, name the
function (`renderCard`, `renderRow`, `renderOption`). When the rendered piece has its
own state or grows, make it a component.

Three cases stay inline:

- a render prop passed as `children` when it is part of the component's contract, such
  as `form.AppField` and `form.Subscribe` of TanStack Form;
- an event handler;
- a data transformation that renders nothing.

## Size

- **A source file has at most 350 lines.** `pnpm run check:file-sizes` enforces it;
  [Checks](../AI_CONTEXT.md#checks) lists the exemptions (tests, stories,
  `components/ui/`, locales, generated code). When a file reaches the limit, extract
  pure helpers, hooks or sub-components, and put table columns, sections and adapters
  in files of their own.
- **A function stays under about 100 lines.** This is a
  [principle](../AI_CONTEXT.md#principles); no tool measures it.

## Imports and exports

`@/` is `app/src`. The dependency rules between layers are in
[Import rules](../AI_CONTEXT.md#import-rules), and `pnpm run check:architecture`
enforces them. In practice:

- A route imports a feature through its root, and a file inside a module imports the
  module's own files with a relative path.

```ts
// app/src/routes/licenses/index.tsx (abridged)
import { LicensesPageContent } from '@/features/licenses';

// app/src/features/feature-flags/components/feature-flag-form/targeting-form.tsx
import { type Targeting, TargetingList } from '../../targeting';
```

- The check rejects an import of another feature, even for a type (`@/features/customers/types`
  from the instances feature, for example), and an import of a functional through a
  path other than `@/functionals/<name>` (`@/functionals/filters/hooks/use-filter-builder`
  instead of `@/functionals/filters`). It warns on a file that imports its own module
  through `@/`.
- A feature's `index.ts` lists what routes consume, by name
  (`export { LicenseForm } from './components'`). `export *` appears in the barrels of
  some domains and in small files that gather sibling modules; do not add it to a
  feature root.
- Types are exported with `export type`.

## Hook dependencies

The lint rule `react/exhaustive-deps` is off, so no tool checks a dependency array.
Write the array in full by hand. When a hook leaves a value out on purpose, such as a
stable callback or a value read from an external store, say why in a comment.

## Spacing

The parent owns the space between its content and its own edges: the padding of a
container, a card or a dialog. A child does not add a `padding-bottom` or a
`margin-bottom` only to leave room below itself at the end of its parent. A child can
keep spacing that is purely internal and functional, such as a `pt-*`, but the
structural space at the end of a section belongs to the parent.
