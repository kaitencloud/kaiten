# @kaitencloud/theme

## 1.0.3

### Patch Changes

- The package is licensed under the Apache License 2.0, like the rest of the Kaiten
  repository, `@kaitencloud/openapi` and `@kaitencloud/graphql-schema`. `LICENSE`
  holds the text published by the Apache Software Foundation, unmodified, and
  `NOTICE` names the copyright holder, KAITEN INC. 1.0.1 and 1.0.2 were published
  under the MIT License. No token changes: same tokens and stylesheets as 1.0.2.

## 1.0.2

### Patch Changes

- Republished so that the package page on npm shows the README again: unpublishing
  1.0.0 cleared it, and npm only takes a README at publication. Nothing else
  changes: same tokens, same files, same license as 1.0.1.

## 1.0.1

### Patch Changes

- The package is licensed under the MIT License, like `@kaitencloud/openapi` and
  `@kaitencloud/graphql-schema`. 1.0.0 was published under Apache-2.0 by mistake.
  The `NOTICE` file, which only the Apache License asked for, is gone. No token
  changes.

## 1.0.0

### Major Changes

- First stable release.

  The tokens, their names and their values, and the four stylesheets are exactly those of 0.6.1: nothing changes for anyone who already uses the package, and there is nothing to migrate.

  From here the package follows [semantic versioning](https://semver.org). Renaming or removing a token, a Tailwind theme key or a stylesheet, or changing a token's value, is a major release, since a value that moves is breaking for anyone who matched the old one. Adding a token or a theme key is a minor release, and a fix that changes no value is a patch.

## 0.6.1

### Patch Changes

- The source moved into the Kaiten repository, next to the console that is its main
  consumer. The package links now point to `kaitencloud/kaiten`. No token changes.

## 0.6.0

### Minor Changes

- Move to a repository of its own and publish on the public npm registry.

  The package now installs from registry.npmjs.org, without credentials, instead of GitHub Packages. The published CSS no longer carries comments, and every token keeps its value. The license is now Apache-2.0.

### Patch Changes

- Declare the stylesheets as side effects. `"sideEffects": false` let webpack drop a JavaScript `import "@kaitencloud/theme/global.css"` from a production build.

## 0.5.0

### Minor Changes

- Take the dark surfaces off GRADIENT NOIR and back onto a neutral ramp.

  The palette rewrite moved the dark surfaces onto the brand's black gradient —
  `--background` on its first stop, `--card` and `--popover` placed along it. That
  gradient is DECORATIVE: it fills a CTA or a hero. It has neither the range nor the
  neutrality to stack four levels of interface, and using it as a surface ramp is a
  category error that cost the theme its legibility.

  Measured against the scale it replaced:

  |                          | before the rewrite | on GRADIENT NOIR |
  | ------------------------ | ------------------ | ---------------- |
  | card luminance           | 0.0169             | 0.0056           |
  | card saturation          | 13 %               | 36 %             |
  | card over app background | 1.176:1            | 1.066:1          |
  | card over popover        | — (shared value)   | 1.033:1          |

  Three levels collapsed into one dark violet field: a modal no longer detached from
  the page behind it, and a field no longer detached from the modal. The gradient's
  own two stops are 1.31:1 apart, so no assignment taken from it does better — the
  ceiling is the ramp, not the choices made on it.

  The surfaces return to the scale that preceded it: `#10141b` / `#1a1b1e` / `#222327`
  / `#2a2c33`, near-neutral greys (8–18 % saturation) across twice the range. The
  hierarchy is carried by the SURFACES — 1.176:1 from the app background to a card —
  which is what lets `--border` and `--input` go back to being a discreet `#33353a`
  hairline rather than structural elements. `--popover` shares the card value again:
  a floating layer is separated by elevation, not by tint.

  What does NOT revert: every semantic colour stays as re-authored. `--primary`,
  `--destructive`, `--success` and `--warning`, their hovers and their `-subtle`
  pairs, `--ring`, the charts, the gradient and the font stacks are unchanged, along
  with the contrast corrections that came with them — `--warning` still takes white
  ink. This is a surfaces-and-neutrals change, and it touches twelve tokens:
  `background`, `app-background`, `card`, `popover`, `secondary`, `secondary-hover`,
  `muted`, `border`, `input`, `sidebar`, `sidebar-accent`, `sidebar-border`.

  Minor, not patch: twelve token values move, and a token whose value moves is
  breaking for anyone who matched the old one. Expect a visible repaint, and expect
  screenshot baselines to need regenerating.

  One gap is knowingly re-introduced and left open: at `#33353a` a control's outline
  sits at 1.14:1, below the 3:1 WCAG 2.1 SC 1.4.11 asks of it. On this ramp a field
  is read by its fill (`dark:bg-input/30` lands `#27282d` on a `#222327` card) rather
  than its outline, and light mode has carried the same gap at `#e2e2e2` throughout.
  Closing it means splitting `--border` from `--input` and taking the latter to
  roughly `#757575`. It is tracked as debt in kaiten's token-contrast check, not
  forgotten.

## 0.4.1

### Patch Changes

- Make `bg-warning-hover` resolve.

  `--warning-hover` has been declared in both token partials since the hover
  family was authored, but it was the one member of that family with no
  `--color-*` entry in the Tailwind mapping. Utilities are generated from the
  mapping, not from the partials, so `hover:bg-warning-hover` compiled to nothing
  at all — silently, since an unmapped utility produces no rule rather than an
  error. Its five siblings (`primary`, `secondary`, `accent`, `destructive`,
  `success`) all resolved, which is what kept the gap invisible.

  The token's value is unchanged; only its mapping is added. Nothing that renders
  today renders differently — a warning hover state that was previously inert now
  paints the colour it was always meant to.

## 0.4.0

### Minor Changes

- Publish the palette rewrite that has been sitting unreleased in source.

  The tokens in `src/styles/*.partial.css` were rewritten to the brand direction —
  neutrals moved onto the DA's ramp (`#070708` / `#f7f7f7`), the brand purple, green
  and orange were each re-derived as the nearest colour to the brand value that still
  carries white text at AA, and `--warning-subtle`, `--warning-hover` and
  `--font-display` were added — but no changeset ever accompanied that work. The
  package went on resolving to the tarball published as 0.3.3, so none of it reached a
  consumer: the Kaiten console kept painting the old amber `--warning: #d97706` with dark ink
  while its own DESIGN.md documented the new `#cf4a03` with white, and its 41
  `*-warning-subtle*` utilities compiled to unresolvable `var()`s against a build that
  had never carried the pair.

  Minor, not patch: 56 token values move, and under a zero major the minor segment is
  where a breaking change goes. Anyone who matched the old values — or screenshotted
  them — will see a different page.

  Consumers upgrading from 0.3.3 should expect a visible repaint, not a patch. Two
  notes for the Kaiten console specifically: `--warning` now takes WHITE ink, not dark, so any
  local pairing that assumed dark text on amber needs rechecking; and the hand-copied
  `--warning-subtle` block in `packages/design-system/src/styles.css` becomes a
  redundant no-op once this version is installed and can be deleted.

## 0.3.3

### Patch Changes

- Documentation: describe the data path and the contract source as they actually are.

  `@kaitencloud/client` documented `getCatalog` / `getSnapshot` as composed
  client-side from REST endpoints. They have been GraphQL-first since 2026-07 —
  one composed query against the platform's `/graphql` aggregate, with the REST
  fan-out kept as the fallback for older APIs, and snapshot feature flags resolved
  live over OFREP on both paths. The `generate-graphql` step and its sibling-checkout
  requirement are documented too.

  `@kaitencloud/core` and the root README pointed `sync-openapi` at a sibling
  Kaiten checkout. It reads the published `@kaitencloud/openapi` contract from
  GitHub Packages, and both generated clients must be regenerated after a sync.

  `@kaitencloud/theme` described `pnpm link` as the cross-repo mode; the nominal
  mode is the published package pinned through the consumer's pnpm catalog.

## 0.3.2

### Patch Changes

- State the runtime contract, and verify it on every build.

  `@kaitencloud/server` now ships CommonJS alongside ESM. It is the package meant to
  run on a backend, and a large share of Node backends are still CommonJS — a
  `require("@kaitencloud/server")` previously failed with `ERR_REQUIRE_ESM` on Node
  below 22.12. It has no dependencies of its own, so the second output costs nothing.
  The exports map now carries explicit `import` / `require` conditions, plus `main`,
  `module` and `types`.

  Every package declares `engines.node`: `>=20.19.0` for the dual-built server
  package, `>=22.12.0` for the ESM-only ones — 22.12 being the release where Node
  can `require()` an ES module. Previously only `@kaitencloud/openfeature` declared
  one, at `>=24.0.0`, which matched this repo's development environment rather than
  any demonstrated runtime need.

  `publint` and `attw` now run on every build of `core`, `client`, `server` and
  `openfeature`, so the published shape is verified rather than assumed. They caught
  the `require` gap the moment they were switched on. `sideEffects: false` is
  declared where it holds, so bundlers can tree-shake.

## 0.3.1

### Patch Changes

- Give the light theme's amber the same dark foreground the dark theme already used

  `--warning-foreground` was `#ffffff` under `--warning: #d97706`, which is 3.19:1 —
  below the WCAG AA 4.5:1 floor for normal text. Amber is a light hue, so it takes
  dark text; the dark theme already paired `#f59e0b` with `#1a1b1e` and the light one
  did not. Light now matches at 5.41:1 and the family is treated the same way in both
  themes.

  Nothing in the SDK pairs these two today, so no component changes appearance.
  Anything overriding `--warning-foreground` for light mode should re-check it.

## 0.3.0

### Minor Changes

- Split `destructive` into a solid pair and a tinted pair

  `--destructive` was asked to do two incompatible jobs: fill a button or badge under
  white text, and colour red text on a faint `bg-destructive/10` surface. A fill dark
  enough for the first is too dark to read red text against, and a fill light enough
  for the second cannot carry white text. Every value tried failed one of them —
  `#e54b4f` failed both, at 3.85:1 on the solid and 4.05:1 on the tint.

  The roles are now separate tokens:

  - `--destructive` / `--destructive-foreground` / `--destructive-hover` — the solid
    fill, dark under white text in **both** themes, so it reads like `--primary` does
    rather than flipping to dark text in dark mode.
  - `--destructive-subtle` / `--destructive-subtle-foreground` — the tinted surface
    and the text on it, authored rather than composited from alpha.

  Light stays `#c91d21` (5.70:1 under white). Dark becomes `#c41c20` (5.94:1) instead
  of a light red with dark text. The tint pair is `#fbecec`/`#c91d21` (4.97:1) and
  `#2b1718`/`#ea7073` (5.70:1).

  Inline error surfaces move from `bg-destructive/10 text-destructive` to
  `bg-destructive-subtle text-destructive-subtle-foreground`. Both new tokens are
  overridable through `appearance.variables`.

- Author hover fills as tokens, follow the system colour scheme, and empty `themes.default`

  **Hover states.** Badges and buttons composited their hover fill with alpha
  (`hover:bg-primary/80`), which blends the fill toward the page and drags its own
  label below WCAG AA — every hover state on those components failed, between 3.71:1
  and 4.49:1. Each fill now has an authored `*-hover` token that moves away from its
  foreground, so the state is visible and the pair stays legible. All of them clear AA
  with margin, and the contrast check no longer carries a single documented exception.

  **A regression this surfaced.** The destructive button labelled itself `text-white`
  instead of using its token, so it could not follow the theme at all. It now uses
  `text-destructive-foreground`. The contrast check learned to read literal
  `text-white` / `text-black`, so a hardcoded colour on a themed fill is caught rather
  than invisible to a token-only scan.

  **Accent.** `--accent-foreground` was `#7b0fff` on a light lavender accent: 4.38:1,
  under the floor, with no room left for a visible hover. Darkened to `#5e00d1`
  (6.13:1, and 4.84:1 on the new accent hover).

  **`appearance.baseTheme` accepts `"system"`**, following `prefers-color-scheme` and
  tracking changes to it. An embedded SDK otherwise stays light on a host page that
  themes itself from the OS setting. The preference is read during render, so there is
  no flash of the light theme on first paint.

  **`themes.default` now overrides nothing** (`variables: {}`). It used to restate the
  default token values, which made it a third copy of colours owned by
  `@kaitencloud/theme` — and it had already drifted from them. Reading
  `themes.default.variables.colorPrimary` no longer returns a value; read the CSS
  variable `--ktn-primary` instead.

  Overriding a fill through `appearance.variables` still moves its hover with it: the
  hover is derived from the new fill when you do not pass one, the way alpha used to
  give you for free. `colorPrimaryHover`, `colorSecondaryHover`, `colorDestructiveHover`
  and `colorAccentHover` are also settable outright.

- Adopt `#00874A` as the product green

  The green was two different colours: progress bars and charts painted the brand
  book's VERT MENTHE `#09CF8D`, while solid success badges used `#047857`, an emerald
  invented so white text could sit on them. Side by side in the same card they read as
  a mismatch.

  The mint cannot serve as a surface. White on it reaches 2.03:1, far under AA, and as
  a progress fill it sits at **1.87:1 against the light track** — effectively invisible
  in light mode, which nothing had caught.

  `#068854` is the closest colour to the mint that carries white text at AA, found by
  minimising CIEDE2000 over the 2,255,244 sRGB colours that clear the contrast ceiling
  — nothing in the gamut is nearer. It also clears the progress track in both themes
  (4.14:1 light, 3.09:1 dark) where the mint failed one. It is now `--success` and
  `--chart-1` in both themes, with white `--success-foreground` and a `#057045` hover.

  (The exact optimum is `#088856`, but it lands on 4.5003:1. `#068854` is its
  neighbour at ΔE 0.49 — indistinguishable by eye, with thirty times the margin.)

  The mint remains the brand book value for marketing surfaces; this is the product
  green, chosen because a token that has to carry text and stand out against a track
  has constraints a brand swatch does not.

  `--ktn-success-badge` and `appearance.variables.colorSuccessBadge` are removed — the
  badge paints `--ktn-success` itself, so a second green would only be one more value
  to keep in step. `colorSuccessHover` is exposed alongside the other hover overrides.

  Also: the usage bar's 80% warning state hardcoded `bg-amber-500` rather than the
  `--warning` token that already existed, so in light mode it painted the dark theme's
  amber. It uses `--ktn-warning` now.

- Generate the SDK's tokens from the shared theme instead of duplicating them

  The token values existed twice: once in `@kaitencloud/theme`'s partials and again,
  hand-copied, as `--ktn-*` in the SDK's `kaiten.css`, which then bridged them onto
  the generic names inside `.kaiten`. Two defects came out of that arrangement.

  The copies drifted. `--destructive` was corrected for WCAG AA contrast in the theme
  and not in the SDK, so the accessible value never reached the components that render
  it — the SDK shipped 3.43:1 in dark mode against a 4.5:1 floor.

  And the bridge only existed in the light block, at a lower specificity than the
  theme's own dark rule. In dark mode the bridge lost, so overriding a dark token
  through `appearance.variables` silently did nothing — half of the documented
  theming API did not work.

  `@kaitencloud/theme` now generates both builds from one set of partials: the
  existing generic pair for host apps, and a `--ktn-*` pair for embedded SDKs
  (`scoped.css` + the new `theme-inline-scoped.css`). `kaiten.css` imports that pair
  and no longer declares token values or bridges at all.

  For consumers:

  - `appearance.variables` and the `--ktn-*` names are unchanged, and dark-mode
    overrides now take effect.
  - The generic names are no longer declared inside `.kaiten`. Host markup passed to
    SDK components no longer inherits the SDK's `--primary`/`--background`.
  - `destructive` shifts to the theme's AA-compliant values: `#c91d21` in light,
    `#ec797c` on a dark `--ktn-destructive-foreground`.
  - `@kaitencloud/theme/scoped.css` now declares `--ktn-*` rather than generic names.
    Anything importing it directly must also import `theme-inline-scoped.css` instead
    of `theme-inline.css`; the generic pair is unchanged for host apps.

## 0.2.0

### Minor Changes

- update dependencies

### Patch Changes

- Bring the `destructive` token up to WCAG AA contrast

  `--destructive` (#e54b4f) failed AA in both of the patterns the components use it
  for: as text on a `bg-destructive/10` tint (3.39:1 light, 4.05:1 dark) and under
  white on a solid fill (3.85:1 in both). That affected shipped components — the
  checkout flow's error surface and the `destructive` badge variant — not just
  Storybook.

  Light theme darkens the fill to #c91d21 (4.83:1 tinted text, 5.70:1 under white).

  The dark theme could not be fixed by moving the fill alone: tinted text needs a
  lighter red while white-on-solid needs a darker one, and no single value satisfies
  both. The fill is lightened to #e9676b and its foreground flipped dark (#1a1b1e),
  giving 4.76:1 and 5.43:1. Consumers overriding `--destructive-foreground` for dark
  mode should re-check it against the new fill.

## 0.1.1

### Patch Changes

- add warning theme var

## 0.1.0

### Minor Changes

- init
