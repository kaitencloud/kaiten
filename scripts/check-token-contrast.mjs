#!/usr/bin/env node
// Fails when a foreground/background pair used by the UI falls below the WCAG AA
// contrast floor, in either theme.
//
// Colour here comes from `@kaitencloud/theme` and from the app's own additions
// (`app/src/tokens.css`). Both are theme-aware: the same name resolves to a different value under
// `:root` and under `.dark`. A literal Tailwind shade cannot do that, so
// `text-green-500` is readable on the dark page and sits at 2.28:1 on the light one —
// which is what this app shipped before those literals became tokens. This check is
// what stops them coming back, and it reads Tailwind's palette too so that a literal
// used as a semantic role is measured rather than ignored.
//
// It is deliberately arithmetic over the token values rather than a browser pass:
// deterministic, no rendering, runs in milliseconds, and it covers hover states,
// which an axe run over the resting DOM never sees.
//
// Pairs are discovered from the source, not hardcoded: every className string literal
// is scanned, and a `text-<token>` found alongside a `bg-<token>[/<alpha>]` in the
// same literal becomes a pair. Hardcoding a list would drift from the components.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIRS = ["app/src"];

// WCAG 2.1 AA for normal-size text. Large text is allowed 3:1, but font size is not
// knowable from a class string, so the stricter floor applies throughout.
const AA = 4.5;

// ---------------------------------------------------------------- colour maths

const parseHex = (hex) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
};

const formatHex = (rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

const composite = (fg, bg, alpha) => fg.map((c, i) => Math.round(alpha * c + (1 - alpha) * bg[i]));

const relativeLuminance = (rgb) => {
  const [r, g, b] = rgb.map((value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrastRatio = (a, b) => {
  const [la, lb] = [relativeLuminance(a), relativeLuminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// ------------------------------------------------------------- token discovery

/**
 * Every stylesheet that declares tokens, in cascade order: the installed theme
 * first, then the app's own additions layered on top. Both use the same
 * `:root { … }` / `.dark { … }` split.
 *
 * Reading the installed dependency rather than a copy is the point — a copy is the
 * thing that drifts. Reading the app's file matters just as much: the
 * tints the app paints its state surfaces with (`--success-subtle` and friends) are
 * declared there, not in the theme, because no SDK component uses them. A check that
 * only looked at the theme would silently skip them.
 */
function tokenSources() {
  const themeCss = [
    "packages/theme/dist/global.css",
  ]
    .map((p) => resolve(repoRoot, p))
    .find((p) => existsSync(p));

  if (!themeCss) {
    console.error("✗ packages/theme is not built. `pnpm install` builds it through its prepare script, or run `pnpm --filter @kaitencloud/theme run build`.");
    process.exit(1);
  }
  return [themeCss, resolve(repoRoot, "app/src/tokens.css")].filter((p) =>
    existsSync(p),
  );
}

function readTokenBlocks() {
  const bodyOf = (css, selector) => {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) return "";
    return css.slice(start, css.indexOf("}", start));
  };

  // Two shapes carry a measurable colour: an opaque hex, and an `rgba()`.
  //
  // The rgba branch is not a nicety. `--border`, `--input` and `--sidebar-border`
  // are opaque in light and translucent in dark, because `background` and `card`
  // are two different dark surfaces and one opaque line cannot sit on both. A
  // hex-only parser skips those dark declarations silently, and the theme's own
  // inheritance then hands back the LIGHT value for a dark measurement — which
  // both invents failures and hides real ones. A translucent token paints over
  // whatever hosts it, so it is resolved here against the block's own page
  // background, keeping every value downstream an opaque triple.
  const colorsIn = (body) => {
    const declarations = [];
    const translucent = [];
    for (const line of body.split("\n")) {
      const hex = /^\s*--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/.exec(line);
      if (hex) {
        declarations.push([hex[1], parseHex(hex[2])]);
        continue;
      }
      const rgba =
        /^\s*--([\w-]+):\s*rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*(?:[,/]\s*([\d.]+)\s*)?\)\s*;/.exec(
          line,
        );
      if (rgba) {
        translucent.push([
          rgba[1],
          [Number(rgba[2]), Number(rgba[3]), Number(rgba[4])],
          rgba[5] === undefined ? 1 : Number(rgba[5]),
        ]);
      }
    }
    const ground = declarations.find(([name]) => name === "background")?.[1];
    for (const [name, rgb, alpha] of translucent) {
      declarations.push([name, ground ? composite(rgb, ground, alpha) : rgb]);
    }
    // The composite above is the value ON THE PAGE, which is the right answer for
    // every text pair below. It is the WRONG answer for a border measured against a
    // card: a translucent token is a different colour on every surface that hosts
    // it, and flattening it against one of them hides that. The raw pair is kept so
    // the structural section can re-composite per surface.
    return { declarations, translucent };
  };

  // Every name a block declares, whatever the value. A token set to a gradient or an
  // `oklch()` is not measurable here, but it IS declared — and the mapping check
  // below asks only whether a name exists, never what colour it holds.
  const namesIn = (body) => [...body.matchAll(/^\s*--([\w-]+):/gm)].map((m) => m[1]);

  const light = new Map();
  const darkOverrides = new Map();
  const lightAlpha = new Map();
  const darkAlpha = new Map();
  const declared = new Set();
  for (const file of tokenSources()) {
    const css = readFileSync(file, "utf8");
    const root = bodyOf(css, ":root");
    const dark = bodyOf(css, ".dark");
    const rootColors = colorsIn(root);
    const darkColors = colorsIn(dark);
    for (const [name, rgb] of rootColors.declarations) light.set(name, rgb);
    for (const [name, rgb] of darkColors.declarations) darkOverrides.set(name, rgb);
    for (const [name, rgb, alpha] of rootColors.translucent) lightAlpha.set(name, { rgb, alpha });
    for (const [name, rgb, alpha] of darkColors.translucent) darkAlpha.set(name, { rgb, alpha });
    for (const name of [...namesIn(root), ...namesIn(dark)]) declared.add(name);
  }

  // Dark only overrides part of the set; anything it omits keeps the light value.
  return {
    declared,
    themes: [
      { name: "light", tokens: light, translucent: lightAlpha },
      {
        name: "dark",
        tokens: new Map([...light, ...darkOverrides]),
        translucent: new Map([...lightAlpha, ...darkAlpha]),
      },
    ],
  };
}

const { declared: DECLARED_TOKENS, themes: THEMES } = readTokenBlocks();

// -------------------------------------------------------- mapping integrity

/**
 * The stylesheets that turn a token into a utility. `@theme inline` is the only
 * thing that makes `--warning-subtle` reachable as `bg-warning-subtle`, and it is
 * written in a DIFFERENT file from the declaration. Nothing but this check ties the
 * two halves together.
 */
function themeInlineSources() {
  const inline = [
    "packages/theme/dist/theme-inline.css",
  ]
    .map((p) => resolve(repoRoot, p))
    .find((p) => existsSync(p));

  return [inline, resolve(repoRoot, "app/src/tokens.css")].filter(
    (p) => p && existsSync(p),
  );
}

function themeInlineMappings() {
  const mappings = [];
  for (const file of themeInlineSources()) {
    const css = readFileSync(file, "utf8");
    for (const [, body] of css.matchAll(/@theme\s+inline\s*\{([^}]*)\}/g)) {
      for (const [, utility, variable] of body.matchAll(/--color-([\w-]+):\s*var\(--([\w-]+)\)/g)) {
        mappings.push({ utility, variable, file: relative(repoRoot, file) });
      }
    }
  }
  return mappings;
}

const MAPPINGS = themeInlineMappings();

/**
 * A mapping that points at a name nothing declares.
 *
 * This is the failure the rest of the file could never see, and it is worth being
 * precise about why. Tailwind still emits the utility — `background-color:
 * var(--color-warning-subtle)` — and that still resolves, to an empty
 * `var(--warning-subtle)`. An empty custom property makes the declaration invalid at
 * computed-value time, so the browser drops it: the tint paints transparent and the
 * `-foreground` falls back to inherited body text. Nothing errors, nothing warns.
 *
 * It was invisible to the contrast scan too, and not by an oversight that a louder
 * `!fg || !bg` would have fixed. The utility regexes are BUILT from the token names,
 * so with `--warning-subtle` undeclared, `bg-warning-subtle` matched nothing, formed
 * no pair, and never reached that guard — 58 utilities across 30 files scanned clean
 * precisely BECAUSE the token was missing. "Not measured" read as "fine".
 *
 * So this runs first and reads only the declarations. It needs no component to use
 * the token, which is what makes it the check that cannot be silently skipped.
 */
const brokenMappings = MAPPINGS.filter((m) => !DECLARED_TOKENS.has(m.variable));

if (brokenMappings.length > 0) {
  console.error(
    `✗ ${brokenMappings.length} @theme inline mapping(s) point at a variable that no\n` +
      `  :root or .dark block declares. Every utility below compiles to an empty\n` +
      `  var() and paints nothing — silently, in both themes:\n\n` +
      brokenMappings
        .map(
          (m) =>
            `  --color-${m.utility}: var(--${m.variable})   ← --${m.variable} is undeclared\n` +
            `      mapped in ${m.file}`,
        )
        .join("\n") +
      `\n\nDeclare the variable in :root and .dark — in @kaitencloud/theme if an SDK\n` +
      `component uses it, otherwise in app/src/tokens.css — or\n` +
      `drop the mapping. Note that a token can be missing from the INSTALLED build of\n` +
      `the theme while present in its source: check the dist, not the repo.`,
  );
  process.exit(1);
}

// ------------------------------------------------------------- source scanning

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

/**
 * Tailwind's own palette, read from the installed copy rather than transcribed.
 *
 * A literal shade is invisible to a token-only scan and survives a theme change the
 * tokens follow, so it has to be checked too. Knowing only `white` and `black` was
 * not enough: `bg-sky-500/15 text-sky-400` shipped at 1.84:1 on the light page and
 * nothing reported it, because neither name resolved to a colour here. Every shade
 * Tailwind defines now does.
 *
 * v4 states them in oklch, so they need converting. The conversion is exact — this
 * is a colour-space change, not an approximation.
 */
function readTailwindPalette() {
  const themeCss = [
    "node_modules/tailwindcss/theme.css",
    "app/node_modules/tailwindcss/theme.css",
  ]
    .map((p) => resolve(repoRoot, p))
    .find((p) => existsSync(p));

  const palette = { white: [255, 255, 255], black: [0, 0, 0] };
  if (!themeCss) return palette;

  const css = readFileSync(themeCss, "utf8");
  for (const [, name, l, c, h] of css.matchAll(
    /--color-([a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g,
  )) {
    palette[name] = oklchToRgb(Number(l) / 100, Number(c), Number(h));
  }
  return palette;
}

function oklchToRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const [a, b] = [C * Math.cos(h), C * Math.sin(h)];

  // Oklab -> LMS (cone response), cubed back out of the cube-root domain.
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  // LMS -> linear sRGB, then the sRGB transfer function.
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => {
    const v = channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
}

const LITERAL_COLORS = readTailwindPalette();

/**
 * The other direction of the same gap.
 *
 * The mapping check above catches a utility whose token is missing. This catches a
 * className whose UTILITY is missing — `text-destructive-subtle-foreground-foreground`,
 * say, where the name resolves to nothing Tailwind ever generated. The result is
 * identical to the warning-subtle failure and just as quiet: no rule is emitted, the
 * colour silently falls back to whatever it inherits, and a scan keyed on real token
 * names cannot see the class at all because it never matches.
 *
 * Scoped to names that LOOK like ours — two or more segments, first segment a family
 * some `@theme inline` mapping actually declares — so Tailwind's own non-colour
 * utilities (`text-sm`, `bg-clip-padding`, `text-balance`) are never candidates.
 */
const MAPPED_UTILITIES = new Set(MAPPINGS.map((m) => m.utility));
const COLOR_FAMILIES = new Set([...MAPPED_UTILITIES].map((u) => u.split("-")[0]));
const COLOR_KEYWORDS = new Set(["transparent", "current", "inherit", "auto", "none"]);
const COLOR_UTILITY = /(?:^|\s)(?:[\w-]+:)*(bg|text|border)-([a-z][\w-]*)(?:\/\d+)?(?![\w-])/g;

const isGeneratedColor = (name) =>
  MAPPED_UTILITIES.has(name) || name in LITERAL_COLORS || COLOR_KEYWORDS.has(name);

const looksLikeOurToken = (name) => {
  const segments = name.split("-");
  return segments.length >= 2 && COLOR_FAMILIES.has(segments[0]);
};

// Longest-first so `muted-foreground` wins over `muted`.
const tokenNames = [...THEMES[0].tokens.keys(), ...Object.keys(LITERAL_COLORS)].sort(
  (a, b) => b.length - a.length,
);
const alternatives = tokenNames.join("|");
const CLASS_STRING = /(["'`])((?:[^"'`\\\n]|\\.)*)\1/g;
const TEXT_UTILITY = new RegExp(`(?:^|\\s)((?:[\\w-]+:)*)text-(${alternatives})(?![\\w-])`, "g");
const BG_UTILITY = new RegExp(
  `(?:^|\\s)((?:[\\w-]+:)*)bg-(${alternatives})(?:/(\\d+))?(?![\\w-])`,
  "g",
);

// Variants that render a SEPARATE box with its own background. Two different ones
// never coexist, so their utilities must not be paired with each other. Everything
// else (hover:, focus:, aria-*:, dark:, breakpoints) restyles the same box and DOES
// pair — which is how hover states get covered here at all.
const PSEUDO_ELEMENTS = new Set([
  "before",
  "after",
  "placeholder",
  "file",
  "marker",
  "selection",
  "first-line",
  "first-letter",
  "backdrop",
]);

const pseudoElementOf = (variantChain) =>
  variantChain
    .split(":")
    .filter(Boolean)
    .find((variant) => PSEUDO_ELEMENTS.has(variant)) ?? "";

function pairsInClassString(value) {
  const foregrounds = [...value.matchAll(TEXT_UTILITY)].map((m) => ({
    token: m[2],
    pseudo: pseudoElementOf(m[1]),
    variants: m[1],
    darkOnly: m[1].includes("dark:"),
  }));
  const backgrounds = [...value.matchAll(BG_UTILITY)].map((m) => ({
    token: m[2],
    alpha: m[3] === undefined ? 1 : Number(m[3]) / 100,
    pseudo: pseudoElementOf(m[1]),
    variants: m[1],
    darkOnly: m[1].includes("dark:"),
  }));

  // A foreground is only "hosted" when the SAME literal paints an unconditional
  // background under it. `hover:bg-secondary` does not host the resting state, so a
  // literal like `text-muted-foreground hover:bg-secondary` still owes us a check
  // against the page — the resting host is somewhere this scan cannot see.
  const hosted = (fg) =>
    backgrounds.some((bg) => bg.pseudo === fg.pseudo && bg.variants === "" && bg.token !== fg.token);
  const unhosted = foregrounds.filter((fg) => !fg.pseudo && !hosted(fg));

  const pairs = [];
  for (const fg of foregrounds) {
    for (const bg of backgrounds) {
      // A pseudo-element's text sits on that pseudo-element's own background; when it
      // declares none with a theme token, the backdrop is unknowable from the class
      // string, so the pair is skipped rather than guessed.
      if (fg.pseudo !== bg.pseudo) continue;
      // `text-X` over `bg-X/n` is ~1:1 by construction, so nobody writes it expecting
      // the two to contrast: the element is sitting on a surface this scan cannot see,
      // typically an inverted one like a tooltip, where `text-background` on a faint
      // `bg-background/10` is exactly right. Reporting it could never be actionable.
      if (fg.token === bg.token) continue;
      pairs.push({
        fg: fg.token,
        bg: bg.token,
        alpha: bg.alpha,
        darkOnly: fg.darkOnly || bg.darkOnly,
      });
    }
  }
  return { pairs, unhosted };
}

const found = new Map();
const unhostedText = new Map();
const inertUtilities = new Map();
for (const dir of SOURCE_DIRS) {
  const absolute = resolve(repoRoot, dir);
  if (!existsSync(absolute)) continue;
  for (const file of walk(absolute)) {
    if (file.includes(".stories.") || file.includes("__tests__")) continue;
    const contents = readFileSync(file, "utf8");
    for (const [, , literal] of contents.matchAll(CLASS_STRING)) {
      for (const [, utility, name] of ` ${literal} `.matchAll(COLOR_UTILITY)) {
        if (isGeneratedColor(name) || !looksLikeOurToken(name)) continue;
        const key = `${utility}-${name}`;
        if (!inertUtilities.has(key)) inertUtilities.set(key, new Set());
        inertUtilities.get(key).add(relative(repoRoot, file));
      }
      const { pairs, unhosted } = pairsInClassString(` ${literal} `);
      for (const pair of pairs) {
        const key = `${pair.fg}|${pair.bg}|${pair.alpha}|${pair.darkOnly}`;
        if (!found.has(key)) found.set(key, { ...pair, file: relative(repoRoot, file) });
      }
      for (const fg of unhosted) {
        const key = `${fg.token}|${fg.darkOnly}`;
        if (!unhostedText.has(key))
          unhostedText.set(key, { fg: fg.token, darkOnly: fg.darkOnly, files: new Set() });
        // Every call site, not just the first: one utility below AA is a work list,
        // and the point of this check is to say how long that list is.
        unhostedText.get(key).files.add(relative(repoRoot, file));
      }
    }
  }
}

// ------------------------------------------- text whose background is out of frame

/**
 * The gate's original blind spot, and the one that mattered.
 *
 * Pairing only within a single literal means a `text-*` whose background comes from
 * anywhere else was skipped outright — and that is where the background almost always
 * comes from: a `Card` in another file, a `cn()` assembling fragments from separate
 * variables, a lookup table keyed by status, an ancestor's `opacity`. Every failure a
 * manual audit turned up had escaped through exactly this hole, including
 * `text-destructive` on every form validation message in the app (2.64:1 on the dark
 * card) and `FieldError` printing white on white.
 *
 * The background is not knowable statically, so the check does the next best thing:
 * measure against each surface the app actually builds pages from, and hold the
 * utility to the WORST of them. A text colour that cannot survive a card is not a
 * text colour, whichever file happens to render it today.
 */
const HOST_SURFACES = ["background", "card", "popover", "muted"];

// Surfaces a page is assembled from, as opposed to fills that carry a label. `-subtle`
// tints belong here: they are surfaces too, which is why their `-foreground` partners
// are ordinary body text and are scanned below.
const PAGE_SURFACES = new Set(["background", "card", "popover", "muted", "sidebar"]);
const isPageSurface = (token) => PAGE_SURFACES.has(token) || token.endsWith("-subtle");

/**
 * `text-<X>-foreground` is the label authored to ride on `bg-<X>` and nowhere else, so
 * measuring it against the page would report a failure that cannot happen —
 * `--primary-foreground` is white *because* `--primary` is dark enough to take it.
 *
 * The exception is the surfaces a page is made of: `--card-foreground`,
 * `--muted-foreground`, `--sidebar-foreground` and every `-subtle-foreground` ARE
 * body text. Excluding them along with the rest would blind this scan to its most
 * common subject — and `--muted-foreground` is precisely the token that turned out to
 * be wrong inside an inverted tooltip.
 */
const isFillLabel = (token) => {
  const base = token.replace(/-foreground$/, "");
  return base !== token && THEMES[0].tokens.has(base) && !isPageSurface(base);
};

/**
 * A surface named as a text colour is a statement that the host is inverted or tinted
 * — `text-background` on a tooltip's `bg-foreground`, `text-card` on a filled banner.
 * The real host is by definition not one of HOST_SURFACES, so guessing would only
 * manufacture failures. These stay the job of the in-literal pairing above.
 */
const isSurfaceAsText = (token) =>
  isPageSurface(token) || ["secondary", "accent", "sidebar-accent", "sidebar-primary"].includes(token);

const scannableAsBodyText = (token) =>
  THEMES[0].tokens.has(token) && !isFillLabel(token) && !isSurfaceAsText(token);

// ------------------------------------------------------------------- the check

/**
 * Pairs that are known to sit below AA and are not fixed yet.
 *
 * Every entry is a debt, not a dispensation. The list is checked for staleness below:
 * the moment an entry starts passing the run fails and demands its removal, so it
 * cannot quietly rot into a permanent allowance.
 *
 * Keyed `<theme>|text-<fg>|bg-<bg>`; the value says why it is still here.
 */
const KNOWN_BELOW_AA = new Map([]);

const keyOf = (r) => `${r.theme}|text-${r.fg}|bg-${r.bg}`;

const failures = [];
const accepted = new Set();
const checked = [];

/**
 * Names that reached the maths and could not be turned into a colour.
 *
 * These used to be `continue`. A skip is the wrong default here: every name in this
 * loop got here by matching a regex built from the token list, so failing to resolve
 * one means the two halves disagree — a token declared in a `.dark` block but not in
 * `:root`, or one whose value is not a plain hex and so was never parsed. Either way
 * the pair goes unmeasured, and an unmeasured pair that reports nothing is
 * indistinguishable from a passing one.
 */
const unresolvable = new Map();
const noteUnresolvable = (token, theme, context) => {
  const key = `${token}|${theme}`;
  if (!unresolvable.has(key)) unresolvable.set(key, { token, theme, context });
};

for (const pair of found.values()) {
  for (const theme of THEMES) {
    if (pair.darkOnly && theme.name !== "dark") continue;
    const fg = theme.tokens.get(pair.fg) ?? LITERAL_COLORS[pair.fg];
    const bg = theme.tokens.get(pair.bg) ?? LITERAL_COLORS[pair.bg];
    if (!fg) noteUnresolvable(pair.fg, theme.name, `text-${pair.fg} in ${pair.file}`);
    if (!bg) noteUnresolvable(pair.bg, theme.name, `bg-${pair.bg} in ${pair.file}`);
    if (!fg || !bg) continue;

    // A translucent fill sits on whatever surface hosts it; enforce the worse case.
    const surfaces =
      pair.alpha === 1
        ? [bg]
        : ["background", "card"]
            .map((name) => theme.tokens.get(name))
            .filter(Boolean)
            .map((surface) => composite(bg, surface, pair.alpha));

    for (const surface of surfaces) {
      const record = {
        theme: theme.name,
        fg: pair.fg,
        bg: pair.alpha === 1 ? pair.bg : `${pair.bg}/${Math.round(pair.alpha * 100)}`,
        surface: formatHex(surface),
        ratio: contrastRatio(fg, surface),
        file: pair.file,
      };
      const seen = checked.find((c) => keyOf(c) === keyOf(record));
      if (seen) {
        if (record.ratio < seen.ratio) Object.assign(seen, record);
        continue;
      }
      checked.push(record);
    }
  }
}

for (const entry of unhostedText.values()) {
  if (!scannableAsBodyText(entry.fg)) continue;
  for (const theme of THEMES) {
    if (entry.darkOnly && theme.name !== "dark") continue;
    const fg = theme.tokens.get(entry.fg);
    if (!fg) {
      noteUnresolvable(entry.fg, theme.name, `text-${entry.fg} in ${[...entry.files][0]}`);
      continue;
    }

    // Hold the utility to the worst surface it could land on: the file that renders
    // it is free to change, and a colour that only works on one of the four is a
    // colour waiting to break.
    const worst = HOST_SURFACES.map((name) => ({ name, rgb: theme.tokens.get(name) }))
      .filter((s) => s.rgb)
      .map((s) => ({ ...s, ratio: contrastRatio(fg, s.rgb) }))
      .sort((a, b) => a.ratio - b.ratio)[0];
    // No host surface resolved at all — the theme is not merely missing a token, it
    // is missing the page itself. Never silently.
    if (!worst) {
      noteUnresolvable(
        HOST_SURFACES.join("/"),
        theme.name,
        `no host surface resolved while measuring text-${entry.fg}`,
      );
      continue;
    }

    const record = {
      theme: theme.name,
      fg: entry.fg,
      bg: worst.name,
      surface: formatHex(worst.rgb),
      ratio: worst.ratio,
      file: [...entry.files][0],
      sites: [...entry.files].sort(),
    };
    const seen = checked.find((c) => keyOf(c) === keyOf(record));
    if (seen) {
      if (record.ratio < seen.ratio) Object.assign(seen, record);
      continue;
    }
    checked.push(record);
  }
}

for (const record of checked) {
  if (record.ratio >= AA) continue;
  if (KNOWN_BELOW_AA.has(keyOf(record))) accepted.add(keyOf(record));
  else failures.push(record);
}

// An accepted pair that now clears AA means the list outlived its reason.
const stale = [...KNOWN_BELOW_AA.keys()].filter(
  (key) => !accepted.has(key) && checked.some((r) => keyOf(r) === key),
);

const describe = (r) =>
  `${r.theme.padEnd(5)} text-${r.fg} on bg-${r.bg} (${r.surface})  ${r.ratio.toFixed(2)}:1`;

if (process.env.VERBOSE) {
  for (const record of [...checked].sort((a, b) => a.ratio - b.ratio)) {
    const mark = record.ratio >= AA ? "ok  " : KNOWN_BELOW_AA.has(keyOf(record)) ? "know" : "FAIL";
    console.log(`  ${mark} ${describe(record)}`);
  }
}

if (inertUtilities.size > 0) {
  console.error(
    `✗ ${inertUtilities.size} className(s) name a colour utility that does not exist.\n` +
      `  Tailwind generates no rule for these, so they paint nothing and the colour\n` +
      `  falls back to whatever it inherits — the same silent failure as an\n` +
      `  undeclared token, from the other end:\n\n` +
      [...inertUtilities.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([klass, files]) =>
          `  ${klass}\n` + [...files].sort().map((f) => `      ${f}`).join("\n"),
        )
        .join("\n") +
      `\n\nFix the name, or add a --color-* mapping in an @theme inline block for it.`,
  );
  process.exit(1);
}

if (unresolvable.size > 0) {
  console.error(
    `✗ ${unresolvable.size} token(s) named by a utility could not be resolved to a\n` +
      `  colour. They were measured against nothing, so they passed by default:\n\n` +
      [...unresolvable.values()]
        .sort((a, b) => a.token.localeCompare(b.token) || a.theme.localeCompare(b.theme))
        .map((u) => `  ${u.theme.padEnd(5)} --${u.token}\n      ${u.context}`)
        .join("\n") +
      `\n\nDeclare the token in BOTH :root and .dark as a 6-digit hex, or stop naming it\n` +
      `in a className. A token this check cannot read is a token it cannot enforce.`,
  );
  process.exit(1);
}

if (stale.length > 0) {
  console.error(
    `✗ ${stale.length} entr(y/ies) in KNOWN_BELOW_AA now meet AA — delete them from\n` +
      `  scripts/check-token-contrast.mjs so the list keeps meaning something:\n\n` +
      stale.map((key) => `  ${key}  (${KNOWN_BELOW_AA.get(key)})`).join("\n"),
  );
  process.exit(1);
}

if (failures.length > 0) {
  console.error(
    `✗ ${failures.length} token pair(s) below WCAG AA ${AA}:1\n\n` +
      failures
        .sort((a, b) => a.ratio - b.ratio)
        .map((r) => {
          if (!r.sites) return `  ${describe(r)}\n      used in ${r.file}`;
          const shown = r.sites.slice(0, 5).map((f) => `        ${f}`);
          const rest = r.sites.length - shown.length;
          return (
            `  ${describe(r)}\n      ${r.sites.length} file(s) paint this with no background of their own:\n` +
            shown.join("\n") +
            (rest > 0 ? `\n        …and ${rest} more` : "")
          );
        })
        .join("\n") +
      `\n\nAdjust the pairing, or the token — in @kaitencloud/theme if the SDK uses it,\n` +
      `otherwise in app/src/tokens.css.\n` +
      `Run with VERBOSE=1 to print every pair that was checked.`,
  );
  process.exit(1);
}

// -------------------------------------------------------- structural contrast

/**
 * The contrast a page is BUILT from, as opposed to the contrast you read.
 *
 * Everything above measures ink against a surface, and none of it can see the
 * failure this section exists for: a theme where every text pair passes and the page
 * is still hard to use, because the levels that separate one region from another have
 * collapsed. It happened here. A palette rewrite moved the dark surfaces onto the
 * brand's decorative black gradient — a ramp authored to fill a CTA, whose own two
 * endpoints are 1.31:1 apart — and the page lost its structure: a card fell from
 * 1.176:1 above the app background to 1.066:1, and a popover landed 1.03:1 from the
 * card under it.
 *
 * The text scan called that theme healthy, and it was right to. Body copy had even
 * IMPROVED, because the surfaces beneath it got darker: `--muted-foreground` went
 * from 6.00:1 to 7.22:1 across the very change that made the UI unreadable. A gate
 * that only measures ink cannot tell those two facts apart.
 *
 * Two rules, and only the first is WCAG's.
 */

// WCAG 2.1 SC 1.4.11 (Non-text Contrast): "visual information required to identify
// user interface components and states" — a control's outline, a focus ring.
const UI_COMPONENT = 3;

// Two stacked surfaces have to be tellable apart, by EITHER means: a step in
// luminance, or a border that carries the separation on its own. Insisting on the
// step alone would outlaw the light theme, where `background` and `card` are both
// `#ffffff` by design and the hairline does all the work.
const SURFACE_STEP = 1.08;

// The floor for a border that IS the separation. Not a standard — no criterion
// covers a decorative rule — so it is calibrated against three measured points
// rather than chosen: the palette that broke bottoms out at 1.17:1, the light theme
// nobody has complained about sits at 1.26:1, and the dark scale this theme restored
// holds 1.40:1. Anything in 1.20–1.26 separates those three; the midpoint is taken.
// Move it only with a fourth measurement, not a hunch.
const VISIBLE_LINE = 1.22;

// The surfaces a page is assembled from, widest first. `app-background` matters here
// and not in the text scan above: it is the shell the dashboard's cards sit on, and
// it carries the largest step in the whole theme (1.176:1).
const STRUCTURE_SURFACES = ["app-background", "background", "card", "popover", "muted", "sidebar"];

/**
 * Which surface sits on which. Not derivable from the source — a token names a role,
 * and only the layout knows what encloses what.
 *
 * `card`/`popover` is deliberately absent. The two share a value in this theme, and
 * that is correct: a floating layer is separated by ELEVATION — its drop shadow —
 * not by tint, which is how a popover over a card has always read. Shadows are not
 * measurable here, so the pair is left out rather than judged by a rule that does not
 * apply to it.
 */
const SURFACE_STACKS = [
  ["app-background", "background"],
  ["app-background", "card"],
  ["background", "card"],
  ["background", "popover"],
  ["background", "sidebar"],
  ["card", "muted"],
  ["popover", "muted"],
];

const borderFor = (a, b) => (a === "sidebar" || b === "sidebar" ? "sidebar-border" : "border");

// Tokens that outline or highlight a control, rather than fill a region.
const COMPONENT_TOKENS = ["input", "ring"];

/**
 * A token's colour ON a given surface.
 *
 * Opaque tokens ignore the surface. Translucent ones do not, and flattening one
 * against a single background — which is what the text resolver above does, on
 * purpose — would report a colour that never renders anywhere else. The raw
 * alpha pairs are kept for exactly this.
 */
const resolveOn = (theme, token, surface) => {
  const raw = theme.translucent.get(token);
  if (raw) return composite(raw.rgb, surface, raw.alpha);
  return theme.tokens.get(token) ?? null;
};

/**
 * Structural rules known to be broken, and not fixed yet.
 *
 * Same contract as KNOWN_BELOW_AA: a debt with a reason, not a dispensation, and the
 * staleness check below fails the run the moment one starts passing.
 */
const KNOWN_BELOW_STRUCTURE = new Map([
  [
    "dark|component|--input",
    "1.14:1 — deliberate. On this scale a field is read by its FILL " +
      "(dark:bg-input/30 lands #27282d on a #222327 card), not by its outline, and " +
      "the hairline is shared with --border where a heavier line would draw a cage. " +
      "Reaching 3:1 means splitting the two tokens and taking --input to ~#757575.",
  ],
  [
    "light|component|--input",
    "1.13:1 — the same gap, and older: light was never touched by the palette " +
      "rewrite. #e2e2e2 has been the field outline throughout. Reaching 3:1 means " +
      "~#8a8a8a, which visibly changes every form on a light page.",
  ],
]);

const structural = [];
const structuralKey = (r) => `${r.theme}|${r.rule}|${r.token}`;
const missingStructural = [];

for (const theme of THEMES) {
  const surfaceOf = (name) => theme.tokens.get(name) ?? null;
  const surfaces = STRUCTURE_SURFACES.map((name) => ({ name, rgb: surfaceOf(name) })).filter(
    (s) => s.rgb,
  );

  // 1. Control outlines, held to WCAG on the WORST surface they can land on. One
  //    record per token: which surface happens to be worst is an implementation
  //    detail of the palette, and keying the debt list on it would make an entry go
  //    stale every time an unrelated surface moved.
  for (const token of COMPONENT_TOKENS) {
    if (!theme.tokens.has(token) && !theme.translucent.has(token)) {
      missingStructural.push({ theme: theme.name, token });
      continue;
    }
    const measured = surfaces
      .map((s) => {
        const colour = resolveOn(theme, token, s.rgb);
        return colour && { ...s, colour, ratio: contrastRatio(colour, s.rgb) };
      })
      .filter(Boolean)
      .sort((a, b) => a.ratio - b.ratio);
    if (measured.length === 0) {
      missingStructural.push({ theme: theme.name, token });
      continue;
    }
    const worst = measured[0];
    structural.push({
      theme: theme.name,
      rule: "component",
      floor: UI_COMPONENT,
      token: `--${token}`,
      surface: `--${worst.name}`,
      rendered: formatHex(worst.colour),
      ratio: worst.ratio,
      passes: worst.ratio >= UI_COMPONENT,
      note: `worst of ${measured.length} surfaces; --${worst.name} is the one that fails first`,
    });
  }

  // 2. Page levels: a step in luminance, or a border that carries it alone.
  //    Recorded either way — a rule counted only when it fails is a rule the summary
  //    line cannot honestly count, and VERBOSE would never show the passing ones.
  for (const [a, b] of SURFACE_STACKS) {
    const [lower, upper] = [surfaceOf(a), surfaceOf(b)];
    if (!lower || !upper) continue;
    const step = contrastRatio(lower, upper);
    const lighter = relativeLuminance(lower) > relativeLuminance(upper) ? lower : upper;
    const rule = borderFor(a, b);
    const line = resolveOn(theme, rule, lighter);
    const lineRatio = line ? contrastRatio(line, lighter) : 0;
    const byStep = step >= SURFACE_STEP;
    structural.push({
      theme: theme.name,
      rule: "surface",
      floor: SURFACE_STEP,
      token: `--${a}/--${b}`,
      surface: `--${rule}`,
      rendered: `${formatHex(lower)} / ${formatHex(upper)}`,
      ratio: step,
      passes: byStep || lineRatio >= VISIBLE_LINE,
      note: byStep
        ? "separated by luminance"
        : `separated by --${rule} alone, at ${lineRatio.toFixed(2)}:1` +
          (lineRatio >= VISIBLE_LINE ? "" : ` — under the ${VISIBLE_LINE}:1 floor`),
    });
  }
}

// A token these rules name but the theme never declares. Same reasoning as the
// unresolvable guard above: unmeasured must never read as passing.
if (missingStructural.length > 0) {
  console.error(
    `✗ ${missingStructural.length} structural token(s) are not declared, so the rule\n` +
      `  that depends on them was never applied:\n\n` +
      missingStructural.map((m) => `  ${m.theme.padEnd(5)} --${m.token}`).join("\n") +
      `\n\nDeclare them in @kaitencloud/theme, or drop them from the structural rules\n` +
      `in scripts/check-token-contrast.mjs.`,
  );
  process.exit(1);
}

const structuralFailures = [];
const structuralAccepted = new Set();
for (const record of structural) {
  if (record.passes) continue;
  const key = structuralKey(record);
  if (KNOWN_BELOW_STRUCTURE.has(key)) structuralAccepted.add(key);
  else structuralFailures.push(record);
}

const staleStructural = [...KNOWN_BELOW_STRUCTURE.keys()].filter(
  (key) => !structuralAccepted.has(key) && structural.some((r) => structuralKey(r) === key),
);

if (process.env.VERBOSE) {
  for (const record of [...structural].sort((a, b) => a.ratio / a.floor - b.ratio / b.floor)) {
    const mark = record.passes
      ? "ok  "
      : KNOWN_BELOW_STRUCTURE.has(structuralKey(record))
        ? "know"
        : "FAIL";
    console.log(
      `  ${mark} ${record.theme.padEnd(5)} ${record.rule.padEnd(9)} ${record.token} ` +
        `(${record.rendered})  ${record.ratio.toFixed(2)}:1  ${record.note}`,
    );
  }
}

if (staleStructural.length > 0) {
  console.error(
    `✗ ${staleStructural.length} entr(y/ies) in KNOWN_BELOW_STRUCTURE now pass — delete\n` +
      `  them from scripts/check-token-contrast.mjs so the list keeps meaning something:\n\n` +
      staleStructural.map((key) => `  ${key}`).join("\n"),
  );
  process.exit(1);
}

if (structuralFailures.length > 0) {
  const why = {
    component: `below WCAG 2.1 SC 1.4.11 (${UI_COMPONENT}:1) — the outline is what identifies the control`,
    surface: `two stacked surfaces under ${SURFACE_STEP}:1, and no border visible enough to separate them`,
  };
  console.error(
    `✗ ${structuralFailures.length} structural rule(s) broken.\n` +
      `  These are the levels the layout is built from, not text. Every text pair can\n` +
      `  pass while these fail — that is exactly how the dark theme became unreadable\n` +
      `  under a green check:\n\n` +
      structuralFailures
        .sort((a, b) => a.ratio / a.floor - b.ratio / b.floor)
        .map(
          (r) =>
            `  ${r.theme.padEnd(5)} ${r.token} (${r.rendered})  ${r.ratio.toFixed(2)}:1, ` +
            `needs ${r.floor}:1\n      ${why[r.rule]}\n      ${r.note}`,
        )
        .join("\n") +
      `\n\nRaise the surfaces or the border in @kaitencloud/theme, or record the gap in\n` +
      `KNOWN_BELOW_STRUCTURE with the reason it stays open. VERBOSE=1 prints every rule.`,
  );
  process.exit(1);
}

const suffix =
  accepted.size > 0 ? `, ${accepted.size} known exception(s) still below AA (see the list)` : "";
const structuralSuffix =
  structuralAccepted.size > 0
    ? `, ${structuralAccepted.size} known exception(s) below the floor (see the list)`
    : "";
console.log(
  `✓ ${checked.length} token pair(s) from ${found.size} className combination(s) ` +
    `meet WCAG AA ${AA}:1${suffix}\n` +
    `✓ ${structural.length} structural rule(s) hold: controls at ${UI_COMPONENT}:1, ` +
    `surface levels at ${SURFACE_STEP}:1 or a border above ${VISIBLE_LINE}:1${structuralSuffix}`,
);
