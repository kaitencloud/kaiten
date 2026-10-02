---
name: app-architecture-guardian
description: Audit or implement Kaiten React changes while preserving frontend ownership and dependency boundaries across routes, features, domains, functionals, components, hooks, and lib. Use for PR reviews, refactors, file moves, shared-module extraction, new features, or any change that may introduce cross-feature imports, deep functional imports, thick routes, or misplaced business code.
---

# App Architecture Guardian

Protect frontend ownership and dependency direction. Treat the executable
architecture check as the baseline, then review placement decisions that
require engineering judgment.

`app/scripts/architecture-rules.ts` is the executable form of the dependency
rules. It only sees imports that start with `@/` or `.`, so it says nothing
about third-party packages. `pnpm run lint` covers two of those cases
(`no-restricted-imports`, declared in `app/vite.config.ts`): Base UI
outside `components/ui/`, and `useMutation`, `useState` and `useReducer` in
routes. Lint does not scan tests, stories or `src/components/ui/`. The rest of
the thin-route rule, data-model icons, generated schemas, query invalidation and
export style are review-only, listed in step 8.

## Workflow

1. Read:
   - `app/docs/AI_CONTEXT.md`
   - `app/docs/01-architecture/folder-structure.md`
   - `app/docs/01-architecture/functionals.md`
   - `app/docs/03-patterns/routes-as-assemblers.md`
2. Inspect the changed files and their import graph.
3. Run from `app/`:

   ```bash
   pnpm run check:architecture
   pnpm run lint
   ```

   Errors fail either check (and CI). Warnings (`internal-relative-import`,
   `module-public-api`) do not, but treat the ones the change introduces as
   findings.
4. Fix every reported boundary violation. Do not suppress or bypass the
   checker.
5. Review ownership manually:
   - `routes/`: URL, loader/prefetch, params and thin composition only.
   - `features/<name>/`: route-facing ownership and business code used by one
     feature.
   - `domains/<name>/`: business contracts, queries, forms, logic or React UI
     shared by sibling features; never page or route ownership.
   - `functionals/<name>/`: generic complex UI with at least two independent
     consumers; no business contracts or API-client dependency.
   - `components/`: generic presentation and form primitives only.
   - `hooks/` and `lib/`: generic shared hooks and infrastructure only.
6. Keep a business module feature-local with one consumer. Extract it to a
   domain at the second independent feature consumer. Do not move code to
   `functionals/` merely because it is complex.
7. Verify public APIs. The check controls who imports a module (see
   [Import rules](../../../app/docs/AI_CONTEXT.md#import-rules)); you control
   what it exports:
   - a feature root barrel (`features/<name>/index.ts`) exports only what routes
     need;
   - do not recreate a global `functionals/index.ts`;
   - feature-private submodules (`feature-flags/rollout`, `targeting`,
     `variants`) are not cross-feature APIs.
8. Check adjacent architecture conventions (the script does not see them; lint
   covers the first two in part):
   - only `components/ui/**` imports `@base-ui/*` directly: lint enforces it,
     and the `rg` below is a cross-check for the tests and stories lint skips;
   - routes contain no mutation, form or substantial presentation logic: lint
     refuses the `useMutation`, `useState` and `useReducer` imports (only
     `useMutation` under `routes/-components/`, the app shell), the rest is
     review;
   - an icon that stands for an entity of `dataModelIcons` comes from
     `@/lib/data-model-icons`, never from `lucide-react` and never another
     glyph; the same glyph with another meaning (`Rocket` on a Deploy button)
     and the icon of a state or a property stay `lucide-react` imports (the
     `One icon per entity` principle). The `rg -nU` below lists the imports to
     judge;
   - API-backed Zod schemas derive from generated schemas;
   - mutation invalidation uses canonical query-key helpers;
   - type-only exports use `export type`, and no new `export *` is added.
9. Update active architecture, convention or feature docs when ownership or a
   public boundary changes.
10. Rerun `pnpm run check:architecture`, `pnpm run lint` and the checks
    appropriate to the change (see the `frontend-quality-gate` skill).

## Rules

The layers and what each may import are in
[AI_CONTEXT.md](../../../app/docs/AI_CONTEXT.md#layers). The rules the two
commands enforce, and the public entry point of each module, are under
[Import rules](../../../app/docs/AI_CONTEXT.md#import-rules). Apply them as
written and do not restate them in a review: cite the rule by name
(`cross-feature`, `feature-root-barrel`, `hook-boundary`, ...).

Routes may load domain query options without transferring screen ownership to
the domain.

## Useful Commands

Run from `app/`; paths are relative to it. Markdown files are excluded because
feature READMEs quote import lines that the rules would forbid.

```bash
cd app
pnpm run check:architecture
pnpm run lint
rg -n "from ['\"]@base-ui/" src --glob '!src/components/ui/**' --glob '!*.md'
rg -n 'useMutation|useState|useEffect|<form|toast\.' src/routes --glob '!*.md'
rg -n "from ['\"]@/features/" src/features src/domains src/functionals src/components --glob '!*.md'
rg -n "from ['\"]@/functionals/[^/'\"]+/" src --glob '!*.md'
rg -n '^export \* from' src --glob '!src/api-client/**' --glob '!*.md'
rg -nU "import [{][^}]*[^A-Za-z](Boxes|Braces|FileText|Flag|MapPinned|Package|Rocket|Server|Tag|UserKey|Users)[^A-Za-z][^}]*[}] from .lucide-react." src --glob '!src/lib/data-model-icons.ts' --glob '!*.md'
```

## Output

- For reviews, report actionable findings first, ordered by severity, with
  file, line, violated boundary and exact fix.
- Distinguish executable-check failures from judgment-based placement issues.
- If no violation exists, say so and note any untested or ambiguous ownership
  risk.
- For implementation tasks, make the smallest coherent move, update imports
  and docs, then report the validation commands and results.
