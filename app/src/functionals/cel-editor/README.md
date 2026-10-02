# `functionals/cel-editor`

A Monaco-based editor for [CEL](https://cel.dev) expressions, plus the pieces
around it: a coloured read-only view of a rule, a full-size editing dialog and a
formatter. The feature-flag targeting screens use it for targeting rules.

It is shared early as a generic editor: context trees and a cancellable lint
callback define its boundary, without a targeting contract or business URL.

Import from `@/functionals/cel-editor`. The rules that apply to every functional
are in [functionals.md](../../../docs/01-architecture/functionals.md).

## What it exports

| Export | Role |
| --- | --- |
| `CelEditor` | The editor. Highlighting, completion, hover documentation, formatting, error markers |
| `CelEditorDialog` | The editor at full size. It edits a draft and commits it through `onApply` only |
| `CelEditorStatus` | The verdict of the check (checking, no issues, or a count that opens the issue list) |
| `CelRulePreview`, `CelRuleHighlight` | A rule rendered as coloured text, without mounting Monaco |
| `formatCEL` | Formats an expression |
| `CelContextNode`, `CelIssue`, `CelLinter`, `CelValueType`, `CelEditorHandle` | Types |

`CelEditor` also exposes a ref (`CelEditorHandle`) with `format()` and
`focusPosition(line, column)`.

## The editor knows nothing about the API

The caller supplies what the editor cannot know, as props:

- `contextRoots` (`CelContextNode[]`): the names a rule may read, as a tree. They
  drive completion and hover documentation. Without them the editor still
  completes the CEL vocabulary.
- `lint` (`CelLinter`): `(rule, signal) => Promise<CelIssue[]>`, the authoritative
  check, usually a call to the server. `issues` and `isChecking` let a caller that
  runs the check itself (a form validator, say) hand the verdict in; they replace
  `lint`.

```tsx
// app/src/features/feature-flags/targeting/hooks/use-targeting-editor-support.ts (abridged)
const lint = useCallback<CelLinter>(async (rule, signal) => {
  const { data } = await lintTargetingRule({
    body: { rule },
    signal,
    throwOnError: true,
  });

  return data.issues ?? [];
}, []);
```

## Syntax check with a WASM engine

Syntax errors are reported locally, by a CEL engine compiled to WebAssembly
(`app/cel-engine`, a Rust crate). It is loaded on demand from `/wasm/cel-engine.js`
by `logic/cel-engine.loader.ts`.

The Docker image builds it in its own stage (see
[Docker](../../../docs/07-deployment/docker.md)), so every published image has
it. Elsewhere, `pnpm run build:wasm`, from `app/`, builds it into
`app/public/wasm/`. It needs Rust and `wasm-pack`. Without the build the local
syntax check stays off; the editor still highlights, completes and shows the
`lint` verdict.

The module is a plain file under `public/`, which the Vite dev server refuses to
serve to an `import()` in the app's code (it answers with a server error): the
check runs on a production build, such as `pnpm run build` then `pnpm run
serve`, or in the image, and stays off under `pnpm run dev` even after
`build:wasm`.

The crate uses `cel`, not `cel-interpreter`. The last `cel-interpreter` (0.10)
panics on most half-typed rules (`1 ==`, `a &&`, an unclosed string...), and a
panic aborts the WebAssembly instance: on the first such keystroke the editor got
a `RuntimeError: unreachable`, and the route's error boundary replaced the page
with "Something went wrong". `cel` returns a parse error for each of them.
Two checks keep it that way, both run by CI's Build job: `pnpm run test:cel-engine`
runs the crate's tests, and `pnpm run test:cel-engine:smoke` loads the built module
in Node (after `build:wasm`) and validates half-typed rules, because only the module
turns a parser panic into the abort the editor would hit.

`disableValidation` turns the local check off explicitly (unit tests without the
WASM build). In Storybook test runs (`window.__KAITEN_STORYBOOK_TEST__`) `CelEditor`
renders a plain `CodeEditor` instead.

## Structure

```
cel-editor/
├── components/   editor, dialog, status, issue list, preview, templates, context popover
├── hooks/        engine loading, syntax validation, lint, Monaco setup
├── logic/        CEL language definition, completion, highlighting, markers, formatter
├── types/        context and engine types
├── stories/      Storybook
└── index.ts      public API
```

The editor itself is built on [`code-editor`](../code-editor/code-editor.tsx),
the shared Monaco wrapper.

The formatter owns its CST types in `logic/format-cel.types.ts`. The editor's
context/engine types are separate; there is no legacy rule-builder AST API.
