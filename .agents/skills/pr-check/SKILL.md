---
name: pr-check
description: Run the Kaiten pre-PR checklist from CONTRIBUTING.md for the areas a change touches (frontend, backend, design tokens, charts, docs) and report a pass/fail summary. Use before opening a PR.
disable-model-invocation: true
---

# Pre-PR check for Kaiten

The checklist is written once, in
[CONTRIBUTING.md](../../../CONTRIBUTING.md#before-you-open-a-pull-request). This
skill runs it and reports the result; it adds no check of its own. Read that
section first, then follow the steps below.

## Steps

1. **Find what changed.** `git diff --name-only <base>...HEAD`, plus the working
   tree. Map each path to a checklist item: `app/` (frontend), `api/` (backend),
   `packages/theme/` (design tokens), `charts/` (Helm charts), and any path that
   needs a doc update (step 3).

2. **Run the matching items**, with the commands CONTRIBUTING.md gives. Frontend
   commands run from `app/`, backend, chart and code-generation tasks from the
   repository root.
   - On a fresh checkout, run `pnpm run generate` in `app/` first: `check:ci`
     expects the generated API client in `app/src/api-client`.
   - `task lint:api` runs golangci-lint with `--fix`, so it may rewrite files:
     review the diff afterwards.
   - After a change to the API contract, regenerate and commit the generated
     files as CONTRIBUTING.md lists them.
   - If errors: show the failing step and the files with violations. If clean:
     report PASS.

3. **Docs check.** List the files changed in `app/src/` that may need a doc update:
   - New pattern added? `app/docs/03-patterns/`
   - New or changed feature? `app/src/features/<feature>/README.md`
   - New component added? `app/docs/05-components/`
   - Conventions changed? `app/docs/02-conventions/`

   Report which docs to update, if any.

## Output format

Report a summary table, with one row per item that applies:

| Check | Status | Details |
|-------|--------|---------|
| Frontend (`check:ci`) | PASS / FAIL / SKIPPED | failing step and errors if any |
| Backend | PASS / FAIL / SKIPPED | failing tests or lint findings |
| Design tokens | PASS / FAIL / SKIPPED | failing `packages/theme` check |
| Charts | PASS / FAIL / SKIPPED | render or lint errors |
| Docs | Up to date / Check needed | doc files to update |

If any check fails, stop and report the issues. Do not try to fix them without
asking.

## Commits and branches

Conventions are in CONTRIBUTING.md (commit messages) and
`app/docs/02-conventions/git-workflow.md` (branch names). For a visible UI change,
attach screenshots to the pull request.
