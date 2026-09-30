# Contributing to @kaitencloud/theme

The Kaiten console reads this package from the workspace: `app/src/tokens.css`
imports `global.css` and `theme-inline.css` from it. Integrators install it from npm.
`dist/` is published together with `package.json`, `README.md`, `LICENSE` and
`NOTICE`, and nothing else.
`README.md` is the package's page on npm, so keep it about using the tokens: notes
for maintainers belong here.

The package is licensed under the Apache License 2.0, like the rest of the
repository and the other packages Kaiten publishes (`@kaitencloud/openapi`,
`@kaitencloud/graphql-schema`). `LICENSE` and `NOTICE` are copies of the files at
the repository root: change them together.

## Build

`pnpm install` at the repository root builds `dist/` through the `prepare` script,
so the console always reads the current tokens. To rebuild by hand:

```sh
pnpm --filter @kaitencloud/theme run build
pnpm --filter @kaitencloud/theme run dev   # rewrites dist/ on every change
```

## Editing tokens

- `src/styles/tokens.partial.css` is the light palette and
  `src/styles/tokens.dark.partial.css` the dark one. Both hold bare `--name: value;`
  declarations, which the generator wraps in selectors.
- Declare every token in **both** partials. A token missing from one mode compiles to
  a `var()` that resolves to nothing in that mode.
- Values are plain literals, with no `var()` between tokens: the scoped build renames
  declarations and never rewrites values.
- `src/styles/theme-inline.css` maps Tailwind's theme keys onto the tokens. Add an
  entry there when a token should become a utility.
- A token enters this package when a consumer other than the console needs it, since a
  published token is API. Tokens only the console paints with stay in the console's
  own stylesheet, `app/src/tokens.css`.
- Explain values in comments as much as they need. The build removes every comment
  from `dist/`, to keep the published stylesheets small.
- A change to a token's value, name or presence needs a new version, see
  [Releasing](#releasing). The package follows semver: renaming or removing a token,
  a Tailwind key or a stylesheet, or changing a token's value, is a major bump, since
  a value that moves is breaking for anyone who matched the old one. Adding a token or
  a key is a minor bump, and a fix that changes no value is a patch.

## The generator

`scripts/generate-css.ts` runs from the `build:done` hook in `vite.config.ts`, after
`vp pack` has written `dist/index.mjs`, and writes four stylesheets:

- `dist/global.css`: the light partial under `:root`, the dark one under `.dark`.
- `dist/theme-inline.css`: `src/styles/theme-inline.css` as written.
- `dist/scoped.css`: both partials renamed to `--ktn-*`, under `.kaiten` and
  `.kaiten.dark, .dark .kaiten:not(.ktn-light)`. Each value is read through
  `--ktn-light-<name>` or `--ktn-dark-<name>` first.
- `dist/theme-inline-scoped.css`: the Tailwind mapping, pointed at `--ktn-*`.

Every comment is removed before a file is written, and the blank lines this leaves
are collapsed. `renderThemeCss()` returns the same four files with their comments,
for `check:stripped-css`.

## Checks

Run from `packages/theme`:

- `pnpm run check`: formatting, lint and types, through `vp check`.
- `pnpm run check:stripped-css`: builds, then asserts that no `dist/*.css` contains
  `/*` and that every selector block holds exactly the declarations of the
  unstripped output.
- `pnpm run check:pack`: run after a build. The tarball, as `pnpm pack` and
  `npm pack` build it, must hold the four stylesheets, `dist/index.mjs` and its
  types, `LICENSE`, `NOTICE`, `README.md` and `package.json`, nothing internal
  and no CSS comment.
- `pnpm run check:theme-drift`: the drift gate, below.

`.github/workflows/theme-ci.yml` runs all four on every pull request that touches
the package. `scripts/check-token-contrast.mjs`, at the repository root, checks the
foreground and background pairs the console paints against WCAG AA.

### The drift gate

`scripts/check-theme-drift.mjs` fetches the tarball published at the version in
`package.json`, anonymously from registry.npmjs.org, and compares its tokens with the
partials. It fails when they differ at the same version: such an edit would never
reach an integrator, because they install the tarball, not this source. Tokens are
compared as parsed declarations, never as bytes.

- **Version not on npm yet:** a release is pending. There is no tarball to compare,
  and the check passes with a notice.
- `KAITEN_REQUIRE_PUBLISHED_THEME=1`, set in CI, fails instead of skipping when the
  registry cannot be reached.
- `KAITEN_PUBLISHED_THEME_DIST=<dir>` compares against an extracted `dist/` instead
  of fetching one.

## Releasing

1. With your change, bump `version` in `package.json` and add an entry at the top of
   `CHANGELOG.md`.
2. Once it is merged, `.github/workflows/release-theme.yml` publishes every version
   npm does not have yet, through npm trusted publishing, with no token. It then tags
   the commit `theme/<version>`.

The trusted publisher is configured once, on npmjs.com, in the package's settings:
GitHub Actions, organization `kaitencloud`, repository `kaiten`, workflow
`release-theme.yml`, no environment.

`packages/theme/.npmrc` sends the `@kaitencloud` scope to registry.npmjs.org, so a
publish from this directory reaches npm even where the scope maps to GitHub Packages.

The workflow packs with pnpm and publishes that tarball with npm: pnpm writes the
catalog's real version ranges into the packed `package.json`, where a bare
`npm publish` would ship `catalog:` as is. Publish by hand the same way, with the
one-time code npm asks for:

```bash
pnpm pack
npm publish kaitencloud-theme-<version>.tgz
```

The workflow tags only the versions it publishes itself. After a publish by hand, tag
the merge commit yourself: `git tag theme/<version> <commit>`, then
`git push origin theme/<version>`.
