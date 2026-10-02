---
name: docs-sync-enforcer
description: Keep app docs synchronized with frontend behavior changes. Use when a PR changes UX, architecture, conventions, or feature workflows.
---

# Docs Sync Enforcer

Enforce documentation updates whenever frontend behavior changes.

## Workflow

1. Read the docs maintenance rule in `app/docs/README.md`: a frontend PR that
   changes behavior updates at least one page of the documentation.
2. Identify behavior changes from diff:
   - route flow, UI content, mutation behavior, state model, architecture boundaries.
3. Map each change to the page that owns it:
   - architecture: `app/docs/01-architecture/`
   - feature grouping: `app/docs/04-features/_template/FEATURE_TEMPLATE.md`
   - conventions: `app/docs/02-conventions/`
   - patterns: `app/docs/03-patterns/`
   - shared components: `app/docs/05-components/`
   - testing and deployment: `app/docs/06-testing/`, `app/docs/07-deployment/`
   - a feature: its own `app/src/features/<name>/README.md`, the single home of
     a feature's documentation (`app/docs/04-features/README.md` only indexes them)
4. Update or create the minimal doc sections needed for long-term coherence.
5. Ensure wording reflects current code, not planned future behavior.
6. Return doc coverage summary with touched files.

## Useful commands

```bash
git diff --name-only
rg -n -i "maintenance" app/docs/README.md
rg -n "<symbol-or-path-you-changed>" app/docs app/src/features/*/README.md
```

## Output

- List changed behavior -> doc file mapping.
- List doc gaps that block merge readiness.
- Provide exact markdown edits required.
