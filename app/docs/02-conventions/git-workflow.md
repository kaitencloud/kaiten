# Git workflow

How a frontend change goes from a branch to `main`. The rules belong to the whole repository, not to `app/`: this page gives the parts you meet when you work on the console, and [CONTRIBUTING.md](../../../CONTRIBUTING.md) is the reference.

## Branches

Branch from an up-to-date `main`, keep one change per branch, and open the pull request against `main`.

Name the branch `<type>/<short-description>`: a type, a slash, and a description in kebab case.

| Prefix | For |
| --- | --- |
| `feat/` | New behaviour |
| `fix/` | A bug fix |
| `chore/` | Tooling, dependencies, clean-up |
| `refactor/` | A change that keeps behaviour |

For example `feat/customer-table-filters`, `fix/release-form-validation` or `chore/bump-playwright`. Any other type of the [commit list](#commits) works as a prefix. A scope such as `app-` in the description is optional.

The prefix matters when a pull request does not target `main`. The CI workflows (`app-ci.yml`, `app-e2e.yml`, `go-ci.yml`, `charts-ci.yml`, `theme-ci.yml` and `pre-commit-ci.yml`) are triggered by pull requests whose **base** branch is `main`, `feat/**`, `fix/**` or `chore/**`. A pull request stacked on another branch gets CI only if that base branch starts with `feat/`, `fix/` or `chore/`.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org/), checked by [commitlint](https://commitlint.js.org/) with the `@commitlint/config-conventional` preset (`commitlint.config.cjs`):

```
<type>(<scope>): <description>

feat(app): add a filter to the release table
fix(app): keep the dialog open when the form is invalid
docs(app): list the environment variables the console reads
```

- **Type.** One of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style` and `revert`, in lower case.
- **Scope.** Optional; [CONTRIBUTING.md](../../../CONTRIBUTING.md#commit-messages) says what it names. Use `app` for a change to the console.
- **Subject.** Not empty, no full stop, and not in sentence, start, Pascal or upper case: start it in lower case. The header stays within 100 characters, and so do the lines of the body and the footer.
- **Body.** Explain why when the header cannot.

Only the local `commit-msg` hook checks the message. CI does not lint commit messages, so install the hooks below.

## Git hooks

Install [pre-commit](https://pre-commit.com/#install) (`pip install pre-commit`, or your package manager), then from the repository root:

```bash
pre-commit install
```

`.pre-commit-config.yaml` lists `commit-msg`, `pre-commit`, `pre-push`, `post-checkout` and `post-rewrite` as the hook types to install, so this one command sets them all up. The two that matter most when you change the console:

- **`commit-msg`** runs commitlint on the message.
- **`pre-push`** runs the API error translation check (`pnpm exec tsx scripts/check-api-error-i18n.ts` in `app/`) when you change `app/src/lib/errors/types.ts` or the `en` or `fr` locale, so it needs the `app/` dependencies installed. When the push touches Go files, it also runs `golangci-lint` on `api/`; pre-commit builds the pinned version of the tool itself.

On commit, the hooks also check whitespace, YAML files, added file sizes, tracked secret files and the Go sources; [CONTRIBUTING.md](../../../CONTRIBUTING.md#git-hooks) has the full list. The `pre-commit-ci.yml` workflow runs the commit-stage hooks on the files of a pull request; `pre-commit run --files <files>` does the same locally.

## Pull requests

- Fill in the [pull request template](../../../.github/PULL_REQUEST_TEMPLATE.md). Attach screenshots or a short recording for a visible UI change.
- Before you push, go through the checklist in [Before you open a pull request](../../../CONTRIBUTING.md#before-you-open-a-pull-request). It is the one checklist. For `app/` it starts with `pnpm run check:ci`, and it says what that command leaves out (the Storybook tests and the Playwright suites).
- Update the page of `app/docs/` or the feature README that covers what you changed; [Maintenance](../README.md#maintenance) says how.
- [CI/CD](../07-deployment/ci-cd.md) lists what each workflow runs on your pull request.
