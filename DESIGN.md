---
version: alpha
name: Kaiten
description: Design contract for Kaiten, expressed as tokens. The fills that carry text hold one value in both modes, darkened from the brand colours so they can carry white; the surfaces differ per mode. Shared by `@kaitencloud/theme` and the Kaiten app so they stay visually in sync.
# Light mode. The brand colours appear here DARKENED until they carry white text.
# See the "Colors" section for why fills and surfaces are treated differently.
colors:
  background: "#ffffff"
  foreground: "#070708"
  app-background: "#f7f7f7"
  card: "#ffffff"
  card-foreground: "#070708"
  popover: "#fcfcfc"
  popover-foreground: "#070708"
  primary: "#8f52ea"
  primary-hover: "#7e48ce"
  primary-foreground: "#ffffff"
  secondary: "#f7f7f7"
  secondary-hover: "#ebebeb"
  secondary-foreground: "#070708"
  muted: "#f7f7f7"
  muted-foreground: "#525252"
  accent: "#ded2f9"
  accent-hover: "#cab7f5"
  accent-foreground: "#5e00d1"
  destructive: "#c91d21"
  destructive-hover: "#9c171a"
  destructive-foreground: "#ffffff"
  destructive-subtle: "#fbecec"
  destructive-subtle-foreground: "#c91d21"
  success: "#068854"
  success-hover: "#057045"
  success-foreground: "#ffffff"
  warning: "#cf4a03"
  warning-hover: "#b64103"
  warning-foreground: "#ffffff"
  warning-subtle: "#fdf0e9"
  warning-subtle-foreground: "#9c3702"
  border: "#e2e2e2"
  input: "#e2e2e2"
  ring: "#000000"
  chart-1: "#068854"
  chart-2: "#9f5ffa"
  chart-3: "#fc6b27"
  chart-4: "#5c44fc"
  chart-5: "#747474"
  sidebar: "#efefef"
  sidebar-foreground: "#070708"
  sidebar-primary: "#000000"
  sidebar-primary-foreground: "#ffffff"
  sidebar-accent: "#f7f7f7"
  sidebar-accent-foreground: "#070708"
  sidebar-border: "#dddddd"
  sidebar-ring: "#000000"
  gradient-start: "#5c44fc"
  gradient-mid-1: "#7640d1"
  gradient-mid-2: "#c32ab1"
  gradient-end: "#fc6b27"

# Dark mode. SURFACES are a near-neutral grey ramp (#10141b, #1a1b1e, #222327,
# #2a2c33), not a brand gradient. STATUS COLOURS do not change: `primary`,
# `destructive`, `success` and `warning` hold one value in both modes (see "Colors"),
# so they repeat the light block on purpose rather than by accident.
colorsDark:
  background: "#1a1b1e"
  foreground: "#f3f4f6"
  app-background: "#10141b"
  card: "#222327"
  card-foreground: "#f3f4f6"
  popover: "#222327"
  popover-foreground: "#f3f4f6"
  primary: "#8f52ea"
  primary-hover: "#7e48ce"
  primary-foreground: "#ffffff"
  secondary: "#2a2c33"
  secondary-hover: "#41444f"
  secondary-foreground: "#f3f4f6"
  muted: "#2a2c33"
  muted-foreground: "#a0a0a0"
  accent: "#3f2b6e"
  accent-hover: "#4e3588"
  accent-foreground: "#c9a9f9"
  destructive: "#c91d21"
  destructive-hover: "#9c171a"
  destructive-foreground: "#ffffff"
  destructive-subtle: "#2b1718"
  destructive-subtle-foreground: "#ea7073"
  success: "#068854"
  success-hover: "#057045"
  success-foreground: "#ffffff"
  warning: "#cf4a03"
  warning-hover: "#b64103"
  warning-foreground: "#ffffff"
  warning-subtle: "#2a1610"
  warning-subtle-foreground: "#fc8b52"
  border: "#33353a"
  input: "#33353a"
  ring: "#9f5ffa"
  chart-1: "#068854"
  chart-2: "#9f5ffa"
  chart-3: "#fc6b27"
  chart-4: "#5c44fc"
  chart-5: "#a0a0a0"
  sidebar: "#161618"
  sidebar-foreground: "#f3f4f6"
  sidebar-primary: "#8f52ea"
  sidebar-primary-foreground: "#ffffff"
  sidebar-accent: "#2a2c33"
  sidebar-accent-foreground: "#f3f4f6"
  sidebar-border: "#33353a"
  sidebar-ring: "#9f5ffa"
  gradient-start: "#5c44fc"
  gradient-mid-1: "#7640d1"
  gradient-mid-2: "#c32ab1"
  gradient-end: "#fc6b27"

typography:
  display:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 30px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.025em
  heading:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: 0em
  body:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0em
    fontFeature: '"rlig" 1, "calt" 1'
  body-lg:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
  button:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1
  caption:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
  badge:
    fontFamily: "DM Sans, ui-sans-serif, sans-serif, system-ui"
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1
  code:
    fontFamily: "Source Code Pro, ui-monospace, monospace"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  serif:
    fontFamily: "Inria Serif, ui-serif, serif"
    fontSize: 16px
    fontWeight: 400

rounded:
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  full: 9999px

spacing:
  base: 4px
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
    typography: "{typography.button}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
    typography: "{typography.button}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
    typography: "{typography.button}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
    typography: "{typography.button}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "0 16px"
    typography: "{typography.button}"
  # The `link` text colour is `primary-subtle-foreground`, an app token declared in
  # `app/src/tokens.css`, so it is not in the `colors` blocks above.
  button-link:
    backgroundColor: "transparent"
    typography: "{typography.button}"
  button-sm:
    rounded: "{rounded.md}"
    height: 32px
    padding: "0 12px"
    typography: "{typography.button}"
  button-xs:
    rounded: "{rounded.md}"
    height: 24px
    padding: "0 8px"
    typography: "{typography.caption}"
  button-lg:
    rounded: "{rounded.md}"
    height: 40px
    padding: "0 24px"
    typography: "{typography.button}"
  button-icon:
    rounded: "{rounded.md}"
    size: 36px
  badge-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  badge-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  badge-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  badge-success:
    backgroundColor: "{colors.success}"
    textColor: "{colors.success-foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  badge-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "2px 10px"
    typography: "{typography.badge}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    height: 36px
    padding: "4px 12px"
    typography: "{typography.body}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: 24px
  popover:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.md}"
    padding: 16px
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-foreground}"
  gradient-button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    height: 32px
    padding: "0 12px"
    typography: "{typography.button}"
  app-shell:
    backgroundColor: "{colors.app-background}"
    textColor: "{colors.foreground}"
  text-muted:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.muted-foreground}"
  nav-item-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  separator:
    backgroundColor: "{colors.border}"
  input-border:
    backgroundColor: "{colors.input}"
  focus-ring:
    backgroundColor: "{colors.ring}"
  chart-series-1:
    backgroundColor: "{colors.chart-1}"
  chart-series-2:
    backgroundColor: "{colors.chart-2}"
  chart-series-3:
    backgroundColor: "{colors.chart-3}"
  chart-series-4:
    backgroundColor: "{colors.chart-4}"
  chart-series-5:
    backgroundColor: "{colors.chart-5}"
  sidebar-nav-active:
    backgroundColor: "{colors.sidebar-primary}"
    textColor: "{colors.sidebar-primary-foreground}"
  sidebar-nav-hover:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-accent-foreground}"
  sidebar-divider:
    backgroundColor: "{colors.sidebar-border}"
  sidebar-focus-ring:
    backgroundColor: "{colors.sidebar-ring}"
  gradient-stop-1:
    backgroundColor: "{colors.gradient-start}"
  gradient-stop-2:
    backgroundColor: "{colors.gradient-mid-1}"
  gradient-stop-3:
    backgroundColor: "{colors.gradient-mid-2}"
  gradient-stop-4:
    backgroundColor: "{colors.gradient-end}"
---

## Overview

Kaiten is a developer-facing product surface: the console in `app/`. The look is calm and dense — close-to-pure neutral surfaces, near-black text, a single saturated violet for brand actions, and a violet→magenta→orange gradient reserved for moments that should feel like a "create" or "primary" affordance (e.g. the framed `GradientButton`).

These tokens live in `packages/theme`, published as `@kaitencloud/theme`, and ship as four CSS files, in two pairs. Each pair is a token file plus the `@theme inline { ... }` block that maps it onto Tailwind v4 theme names (`--color-*`, `--font-*`, `--radius-*`, `--shadow-*`, `--tracking-*`):

- `global.css` — tokens at `:root` (and dark under `.dark`). For apps that own the whole page (the Kaiten console itself).
- `theme-inline.css` — the Tailwind mapping for `global.css`.
- `scoped.css` — the same values under `--ktn-*` names, scoped under `.kaiten` (dark under `.kaiten.dark, .dark .kaiten:not(.ktn-light)`). For components embedded in a page the host owns.
- `theme-inline-scoped.css` — the same Tailwind mapping, reading the `--ktn-*` names.

The console imports the global pair through `app/src/tokens.css`, which also declares the app's own state tints (`--success-subtle`, `--info`, `--distribution-*`, …) on top of it. `app/src/styles.css` pulls that file in:

```css
/* app/src/styles.css */
@import "tailwindcss";
@import "./tokens.css";
```

Any other consumer pairs Tailwind v4 directly with one pair of the package's files:

```css
@import "tailwindcss";
@import "@kaitencloud/theme/global.css";
@import "@kaitencloud/theme/theme-inline.css";
```

or, for components embedded in a page the host owns:

```css
@import "tailwindcss";
@import "@kaitencloud/theme/scoped.css";
@import "@kaitencloud/theme/theme-inline-scoped.css";
```

The component layer (`app/src/components/ui`) is a shadcn/ui "new-york" style baseline with `lucide` icons, customized to the tokens above. Anything new should consume the tokens through Tailwind utility classes (`bg-primary`, `text-muted-foreground`, `rounded-md`, `shadow-sm`, …) — not raw hex values.

## Colors

The palette is intentionally narrow: one brand violet, semantic status pairs, and a small neutral ramp.

**A fill that carries text holds ONE value in both modes. A surface does not.** That
split is the whole rule, and it follows from a design decision: white ink on every
strong fill. White is what constrains the palette, not the reverse — a fill dark
enough to carry white in one mode is dark enough in the other, so there is no reason
for `primary`, `destructive`, `success` and `warning` to differ between them.

Seventeen tokens are therefore mode-invariant (the four status pairs, their hovers,
`chart-1..4` and `sidebar-primary-foreground`), as are the four gradient stops.
Thirty are not: every surface, every text colour, the accent wash, the tinted
pairs, `ring` and the sidebar. Dark SURFACES are a near-neutral grey ramp, deliberately
NOT a decorative gradient: see "Surfaces" below.

**The cost, stated plainly: the brand colours are not in the semantic
palette.** They are light and saturated — violet `#9f5ffa`, mint `#09cf8d`,
orange `#fc6b27` — and none of them carries white text (3.82:1, 2.03:1, 2.89:1). An
exhaustive search over sRGB for the nearest colour to each that clears 4.5:1 against
white AND separates from both the white and the dark card returns: violet at ΔE2000
5.18, orange at 12.19, mint at **21.09**. So `primary` stays recognisably the brand
violet, while `success` cannot be the mint at all — no green that does the job is
nearer than ΔE 21.

The mint is a BRAND colour, not a status fill: two greens on one card read as a
distinction that does not exist, so `success` is the darker `#068854`. The mint cannot
be a fill under white text or text on a light page. The console uses it in one place,
as success text on a dark surface (`--success-subtle-foreground` in
`app/src/tokens.css`), where it reads at 8.46:1 on `--background`.

This is also why shadcn's default, `bg-primary` with a white `primary-foreground`,
cannot take a brand colour as it stands: none of them carries white.

**Brand**

- `primary` `#8f52ea` — the brand violet `#9f5ffa` taken down to the first point where it carries white (4.60:1). ΔE2000 5.18 from the brand value: perceptible side by side, unmistakably the same colour. Identical in both modes. The brand violet `#9f5ffa` itself is used on `ring` and `chart-2`, which carry no text.
- `accent` `#ded2f9` (light) / `#3f2b6e` (dark) with `accent-foreground` `#5e00d1` / `#c9a9f9` — a soft violet wash for hovered ghost surfaces and subtle highlights.
- Hover fills are explicit tokens (`primary-hover`, `secondary-hover`, `accent-hover`, …), not alpha composites. A strong fill (`primary`, `destructive`, `success`, `warning`) DARKENS on hover in both modes, because its white ink has to stay above the floor: `primary-hover` carries white at 5.67:1, while lightening `primary` toward the brand violet `#9f5ffa` would drop white to 3.82:1. A surface fill (`secondary`, `accent`) darkens in light and LIGHTENS in dark.

**Surfaces (light → dark)**

- `background` `#ffffff` → `#1a1b1e` — base page surface inside content.
- `app-background` `#f7f7f7` → `#10141b` — the outer chrome/shell. The light value is the brand light grey. In dark it is the DARKEST content level, and the 1.176:1 step up to a card is what makes the dashboard read.
- `card` `#222327` in dark — raised content blocks. In light it stays `#ffffff` and separates from the page by its border, not by a tint.
- `popover` `#fcfcfc` → `#222327` — floating layers (menus, popovers, tooltips). It SHARES the card value in dark on purpose: a floating layer is separated by elevation — its shadow — not by tint.
- `secondary` / `muted` `#f7f7f7` → `#2a2c33` — the top of the dark ramp.
- `sidebar` `#efefef` → `#161618` — primary navigation rail; sits *darker* than `background` in both modes (it's a quiet zone, not a raised one).

**Why the dark ramp is not a gradient.** A decorative gradient, such as near-black
`#070708` to indigo `#242239`, fills a CTA or a hero. It has neither the range nor the
neutrality to stack four levels of UI: those two stops are only 1.31:1 apart, and the
result is violet where a surface ramp has to be grey. The ramp here is near-neutral
greys, with hierarchy carried by the SURFACES (1.176:1 between the shell and a card)
rather than by the hairline between them.

The light ramp is pure grey (`#ffffff`, `#fcfcfc`, `#f7f7f7`, `#efefef`, `#e2e2e2`). The dark ramp is near-neutral, with a slight cool tint. Keep both free of a stronger cast, such as slate: `#f7f7f7` and `#070708` anchor the light theme, and a tinted ramp drifts from them.

**Text**

- `foreground` `#070708` → `#f3f4f6` — primary copy on `background`/`card`. The light value is the brand black, not pure black.
- `muted-foreground` `#525252` → `#a0a0a0` — secondary copy, captions, helper text.
- `secondary-foreground` `#070708` → `#f3f4f6` — text on `secondary` chips/buttons.

**A rule worth stating once:** `primary`, `destructive`, `success` and `warning` are FILL colours, tuned to carry their `-foreground` on top. They are not ink.

Since they were pulled down far enough to carry white, they now happen to read on a LIGHT page — 4.51:1 to 5.70:1 on white. That is a coincidence of the constraint, not a licence. On a DARK surface the same values fail, and for exactly the reason that made them work as fills: `destructive` is 2.75:1 on `--card`, and all four sit between 2.44:1 and 3.09:1 on `--secondary`. A component coloured this way looks fine in light mode and is unreadable in dark.

For accented text on a surface, reach for `accent-foreground` or a `*-subtle-foreground` — they are set per mode precisely for this.

**Status**

- `destructive` `#c91d21` — error and destructive actions, white foreground (5.70:1).
- `success` `#068854` — the one green in the system, white foreground (4.51:1). It is the closest colour to the brand mint that carries white AND separates from both cards; nothing nearer than ΔE 21 exists. See the note above on why the mint is not the fill.
- `warning` `#cf4a03` — the brand orange brought down to carry white (4.53:1), ΔE 12.19 from `#fc6b27`.
- Each of `destructive` and `warning` also has a **subtle** pair (`*-subtle` / `*-subtle-foreground`) for tinted panels. One token cannot serve both roles: a fill dark enough to carry white text is too dark to read coloured text against. Add a new subtle pair only when a component actually needs it.

**Borders & focus**

- `border` and `input` share the same hairline: `#e2e2e2` in light, `#33353a` in dark. Both are opaque: the levels above are close enough in luminance for one value to serve them all (1.14–1.50:1 depending on the level), and far enough apart that the separation never rests on the hairline alone.
- A field is read by its FILL, not its outline: `dark:bg-input/30` lands `#27282d` on a `#222327` card. ⚠ That leaves a control's outline below the 3:1 WCAG 2.1 SC 1.4.11 asks for — 1.14:1 in dark, 1.13:1 in light. The gap is deliberate and tracked as debt in `scripts/check-token-contrast.mjs` (`KNOWN_BELOW_STRUCTURE`), not ignored. Closing it means splitting the two tokens and taking `input` to roughly `#757575` / `#8a8a8a`.
- `scripts/check-token-contrast.mjs` enforces the structure on every PR alongside the text pairs: controls at 3:1, and every stacked pair of surfaces separated either by 1.08:1 of luminance or by a border above 1.22:1. A theme can pass every text check and still be unusable, so the levels are measured as their own rules.
- `ring` is `#000000` in light mode (high-contrast focus on white) and `#9f5ffa` in dark (the brand violet pops on dark surfaces).

**Charts**

`chart-1..5` is a fixed-order data palette: green, violet, orange, blue, neutral grey. Use them in series order — don't pick by hand. `chart-2..4` are the brand violet `#9f5ffa`, orange `#fc6b27` and blue `#5c44fc`, unmodified. `chart-1` follows `success` (`#068854`) so a data series never puts a second green beside a success badge. Only `chart-5` differs by mode (light `#747474` / dark `#a0a0a0`).

**Gradient**

`primary-gradient` is a 90° linear gradient: `#5c44fc → #7640d1 → #c32ab1 → #fc6b27` — the Kaiten brand gradient. It is the brand signature and should appear *sparingly*: as a 2px frame around a neutral inner button (`GradientButton`), as a hero accent, or as the fill of the single most important action on a surface — never on ordinary CTAs.

When it is used as a fill under text, it needs a scrim. Its orange end carries white at only 2.89:1, and nothing that reads as orange can do better. No console component puts text on the gradient: `GradientButton` paints a 2px frame around a `bg-background` button. The token stays pure for surfaces that carry no text. A component that does put text on it adds its own scrim and measures the result by hand, because `scripts/check-token-contrast.mjs` does not read gradients.

## Typography

One sans family carries the entire UI; serif and mono are loaded for narrow purposes.

- **Sans — DM Sans** (`--font-sans`). Default for everything: body, headings, labels, buttons, badges. Falls back to `ui-sans-serif, sans-serif, system-ui`.
- **Serif — Inria Serif** (`--font-serif`). Reserved for editorial/marketing surfaces; not used in product chrome.
- **Mono — Source Code Pro** (`--font-mono`). Used wherever code is rendered (`<code>`, code editors, inline identifiers).

The body has `font-feature-settings: "rlig" 1, "calt" 1` enabled globally — required ligatures and contextual alternates — for slightly more polished prose.

**Tracking**

`--tracking-normal` is `0em`. The five derivative steps (`tighter -0.05em`, `tight -0.025em`, `wide +0.025em`, `wider +0.05em`, `widest +0.1em`) are computed from it in `theme-inline.css`. Use `tracking-tight` for large display headings; leave body at normal.

**Sizes (typical use)**

- 12px (`text-xs`) — captions, badges, helper text.
- 14px (`text-sm`) — body, labels, buttons. *This is the default UI size*, not 16px.
- 16px (`text-base`) — long-form reading; inputs on mobile (`md:text-sm` collapses to 14px on desktop).
- 20px (`text-xl`) — section headings.
- 30px (`text-3xl`) — page titles.

## Layout

Spacing is a 4px (`--spacing: 0.25rem`) base scale — every Tailwind spacing utility is a multiple. Common steps:

- `1` (4px) — icon-to-label gap inside a tight chip.
- `2` (8px) — icon-to-label gap in buttons (`gap-2`), small stack gap.
- `3` (12px) — input padding, badge padding.
- `4` (16px) — card content rhythm, default form field gap.
- `6` (24px) — card padding, section gap.
- `8` (32px) — page-section gap.

**Standard control heights**

- `h-6` (24px) — `xs` button.
- `h-8` (32px) — `sm` button, gradient-framed inner button.
- `h-9` (36px) — **default** button and input height. This is the baseline.
- `h-10` (40px) — `lg` button.

**Icons**

`lucide-react` is the icon set. Default icon size is `size-4` (16px); inside `xs` controls it shrinks to `size-3` (12px). Icons are placed before labels with `gap-2` (8px).

## Elevation & Depth

Shadows are subtle — Kaiten avoids floating-card looks. The same eight shadow steps exist in both modes; dark uses a higher opacity (0.16 vs 0.10) and a slight Y-offset (2px vs 1px) to compensate for lower contrast.

| Token | Light | Use |
|---|---|---|
| `shadow-2xs` / `shadow-xs` | `0 1px 3px hsl(0 0% 0% / 0.05)` | Inputs, small chips with depth. |
| `shadow-sm` / `shadow` | `0 1px 3px / 0.10, 0 1px 2px / 0.10` | Cards, default raised surface. |
| `shadow-md` | adds a 2nd layer | Hovered cards, dropdowns. |
| `shadow-lg` | wider blur | Popovers, sheets. |
| `shadow-xl` | wider still | Dialogs, command palette. |
| `shadow-2xl` | `0 1px 3px / 0.25` | Reserved — modal-over-modal cases. |

The `--shadow-color` is plain black (`oklch(0 0 0)` / `hsl(0 0% 0%)`). Don't introduce colored shadows.

Z-stack: `z-50` is the dialog layer. The Monaco editor's overflow widgets explicitly use `z-100` so suggestion popups render above dialogs (see `app/src/styles.css`).

## Shapes

Radius derives from a single source (`--radius: 0.625rem` = 10px). The Tailwind theme exposes these steps:

- `rounded-sm` — 6px (menu and list items such as `select` and `command` options, small icon controls such as the `number-input` steppers).
- `rounded-md` — 8px (buttons including `xs` and `icon-xs`, inputs, badges, popovers — *most things*).
- `rounded-lg` — 10px (dialogs, alerts, tab lists).
- `rounded-xl` — 14px (cards).
- `rounded-full` — circles only (avatars, dot indicators).

Borders are 1px and use `--color-border`. The base layer in the app applies `border-border outline-ring/50` to every element by default — so adding `border` is enough; you rarely need to set the color explicitly.

## Components

The component baseline is **shadcn/ui (`new-york` style)** in `app/src/components/ui`, customized to the tokens above. Most components are thin wrappers that set `data-slot="<name>"` on their root element, so consumers can target slots without forking the component.

**Buttons** (`button.tsx`) — variants and sizes are the contract:

- Variants: `default` (primary violet), `destructive`, `outline`, `secondary`, `ghost`, `link`. The `link` text is `primary-subtle-foreground`, not `primary`: `primary` is a fill, not ink.
- Sizes: `default` (h-9), `xs` (h-6), `sm` (h-8), `lg` (h-10), and icon variants (`icon`, `icon-xs`, `icon-sm`, `icon-lg`).
- Focus: 3px ring at `ring/50` with a colored border, applied via `focus-visible:`. Don't override.
- `aria-invalid` swaps the ring/border to destructive automatically — wire form errors to `aria-invalid`, not custom classes.

**Gradient button** (`app/src/components/gradient-button.tsx`, outside `ui/`) — a special-case primary CTA. The brand gradient sits as a 2px frame; the inner button is `bg-background` and uses normal hover (`hover:bg-muted`). Use it for the *single* most prominent "create" action on a screen — never two on the same view.

**Badge** (`badge.tsx`) — variants: `default`, `secondary`, `destructive`, `success`, `outline`. Always `text-xs font-semibold`, `rounded-md`, `px-2.5 py-0.5`.

**Input** (`input.tsx`) — h-9, `rounded-md`, `border-input`. Renders 16px on mobile (`text-base`) and 14px on desktop (`md:text-sm`) — keep this; iOS zooms inputs under 16px.

**Card** (`card.tsx`) — `rounded-xl`, `py-6`, `gap-6`, `shadow-sm`. Subcomponents (`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`) compose via grid. `CardAction` automatically slots into the top-right when present.

**Other primitives** live in `app/src/components/ui/`, one file each: `accordion`, `alert`, `alert-dialog`, `breadcrumb`, `calendar`, `checkbox`, `command`, `dialog`, `field`, `select`, `sheet`, `sidebar`, `slider`, `switch`, `tabs`, `textarea`, `toggle`, `toggle-group`, `tooltip`, `chart`, `chart-shell`, `sonner` (toasts) and more. Their stories are in `app/src/components/ui/stories/`.

**Higher-level patterns** in `app/src/components/`: `combobox`, `date-picker`, `date-range-picker`, `destructive-action-button`, plus the `dialog/`, `form/`, `route/` and `stories/` subfolders. Compose these before reaching for a new primitive.

**External component registries** are pre-wired in `app/components.json`: `@blocks`, `@kibo-ui`, `@magicui`, `@coss`. New primitives can be pulled via shadcn CLI; they'll inherit the tokens automatically because everything resolves to CSS vars.

## Do's and Don'ts

**Do**

- Consume tokens through Tailwind utilities: `bg-primary`, `text-muted-foreground`, `border-border`, `rounded-md`, `shadow-sm`. Both theme builds (global and scoped) expose the same utility names, so a component written once works with either.
- Reach for an existing variant before adding a new one. If `button` doesn't have it, the design probably needs to change, not the component.
- Pair every foreground with its matching `*-foreground` token (`bg-primary` → `text-primary-foreground`, `bg-card` → `text-card-foreground`). Contrast is part of the token contract.
- Use `data-slot` attributes to target nested parts of shadcn primitives instead of class-name surgery.
- Use `lucide-react` for icons at `size-4` (or `size-3` inside `xs` controls).
- Default to the violet `primary` for one primary action per view. Use the gradient button for at most one — usually a "create" action.

**Don't**

- Don't hardcode hex values in component code. Hexes belong to the token files: `packages/theme/src/styles/tokens.partial.css`, `tokens.dark.partial.css` and `app/src/tokens.css`. `gradient-button.tsx` reads `--primary-gradient` instead of copying its stops.
- Don't introduce new colors outside the existing token set. If you need a new semantic role, add it to both `packages/theme/src/styles/tokens.partial.css` *and* `tokens.dark.partial.css`, and map it in `theme-inline.css` in the same folder; the scoped build is generated from these files. A role only the console uses goes in `app/src/tokens.css` instead: its `:root` and `.dark` blocks, and its `@theme inline` block.
- Don't use the gradient as a fill on regular buttons — it belongs in the `GradientButton` frame or hero accents only.
- Don't override focus rings. The 3px `ring/50` ring is consistent across buttons, inputs, and combobox triggers; replacing it breaks keyboard-nav affordance.
- Don't pick chart colors by hand. Use `chart-1..5` in series order so multi-chart pages stay legible.
- Don't ship a component that only works in light mode. Every token has a dark counterpart; verify under `.dark` before merging.
- Don't mix the two theme builds. `global.css` goes with `theme-inline.css`, `scoped.css` with `theme-inline-scoped.css`; crossing them leaves utilities pointing at variables nothing declares.

### Contrast

Every token pair in this document clears **WCAG AA 4.5:1** for normal-size text, in
both modes. The mode split described under "Colors" is what makes that possible
without exceptions.

| Pair | Light | Dark |
| --- | --- | --- |
| `primary` + `primary-foreground` | 4.60:1 | 4.60:1 |
| `destructive` + `destructive-foreground` | 5.70:1 | 5.70:1 |
| `success` + `success-foreground` | 4.51:1 | 4.51:1 |
| `warning` + `warning-foreground` | 4.53:1 | 4.53:1 |
| `accent` + `accent-foreground` | 6.13:1 | 5.91:1 |
| `destructive-subtle` pair | 4.97:1 | 5.70:1 |
| `warning-subtle` pair | 6.36:1 | 7.34:1 |
| `card` + `card-foreground` | 20.14:1 | 14.26:1 |
| `muted-foreground` on `secondary` | 7.29:1 | 5.33:1 |

The four status rows read the same in both columns because those tokens hold one
value — that is the rule, not a copy-paste.

This is enforced, not documented on trust. `scripts/check-token-contrast.mjs`
derives the pairs from the class-name combinations components actually use and fails
CI below the floor. It runs in the `app-ci.yml` workflow and in `pnpm run check:ci`
from `app/`. Two gaps remain. Nothing checks the gradient, which no pair-based check
can see: a component that puts text on it measures the result by hand. And the
Storybook a11y addon (`@storybook/addon-a11y`), which looks at misuse at the
component level, such as a fill colour used as *ink*, is set to `todo`: its
violations show in the Storybook UI and do not fail CI.

The one value that genuinely cannot be rescued is the brand mint on a light page:
`#09cf8d` on white is 2.03:1, and no amount of darkening keeps it recognisably mint. It
is neither a fill nor text on a light page. It appears only in dark mode, as success
text (`--success-subtle-foreground`, 8.46:1 on `--background`); light mode uses the
darkened `#068854` for fills and `#057045` for text.

### Fonts are declared here but shipped by nobody

`--font-sans` resolves to `DM Sans`, and **neither the app nor `@kaitencloud/theme`
loads it** — no `@fontsource` dependency, no font files, no stylesheet link. Unless
DM Sans is installed on the viewer's machine, the console renders in the system UI
font.

Declaring a family is not shipping it. The theme package names the families and
loads no font files (its README says so); loading DM Sans for the console is the
app's job. The same goes for `--font-serif` and `--font-mono`.
