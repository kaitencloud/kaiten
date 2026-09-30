# @kaitencloud/theme

Kaiten's design tokens: colours for light and dark mode, fonts, radius, shadows and
letter spacing, as CSS custom properties with a matching
[Tailwind CSS v4](https://tailwindcss.com) theme. The Kaiten console and integrators
who style their own UI to match read the same values from this package.

## Install

```sh
npm install @kaitencloud/theme
```

## Two builds

The same tokens ship in two builds. Each build is a pair of files: the tokens, and an
`@theme inline` block that maps Tailwind's theme keys onto them. Import both files of
one pair.

### Apps that own the page: `global.css` + `theme-inline.css`

`global.css` declares the tokens under plain names (`--primary`, `--background`,
`--radius`, …) on `:root`, and the dark palette on `.dark`. `theme-inline.css` maps
Tailwind's keys onto them: `--color-primary` reads `var(--primary)`.

```css
@import "tailwindcss";
@import "@kaitencloud/theme/global.css";
@import "@kaitencloud/theme/theme-inline.css";
```

Utilities such as `bg-primary text-primary-foreground` then use the Kaiten palette,
and a `dark` class on an ancestor switches them to dark mode. Without Tailwind,
import `global.css` on its own and read the variables:

```css
@import "@kaitencloud/theme/global.css";

.button {
  background: var(--primary);
  color: var(--primary-foreground);
  border-radius: var(--radius);
}
```

### Components embedded in someone else's page: `scoped.css` + `theme-inline-scoped.css`

`scoped.css` declares the same values under `--ktn-*` names, scoped to `.kaiten`, so
they neither collide with the host page's variables nor inherit from them. Dark mode
applies to `.kaiten.dark`, and to a `.kaiten` element inside a `.dark` page unless
that element also has the `ktn-light` class. `theme-inline-scoped.css` maps
Tailwind's keys onto the prefixed names: `--color-primary` reads `var(--ktn-primary)`.

```css
@import "tailwindcss";
@import "@kaitencloud/theme/scoped.css";
@import "@kaitencloud/theme/theme-inline-scoped.css";
```

This is the pair for components you embed in a page you do not own, and the `--ktn-*`
names are the ones to override. Each scoped token first reads a per-mode override,
`--ktn-light-<name>` or `--ktn-dark-<name>`, then falls back to the Kaiten value.

Tailwind's theme keys are the same in both builds, so a component written once
(`bg-primary`) works with either pair. Mixing the pairs, scoped tokens with the plain
mapping or the reverse, leaves utilities pointing at variables nothing declares.

## Fonts

The font tokens name DM Sans, Inria Serif and Source Code Pro, each followed by
system fallbacks. The package loads no font files: load the fonts yourself if you
want them.

## Versioning

The package follows [semantic versioning](https://semver.org) from 1.0.0. The
stylesheets, the token names they declare and the Tailwind theme keys they map are its
public interface: renaming or removing one, or changing a token's value, is a major
release, and adding one is a minor release.

## Support

Questions and bug reports: [kaitencloud/kaiten issues](https://github.com/kaitencloud/kaiten/issues).

## Source

The tokens are authored in [kaitencloud/kaiten](https://github.com/kaitencloud/kaiten/tree/main/packages/theme),
next to the Kaiten console.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. The license does not grant permission to use
the Kaiten name or logos: see the
[trademark policy](https://github.com/kaitencloud/kaiten/blob/main/TRADEMARKS.md).
