import { defineConfig } from 'vite-plus';

import { generateThemeCss } from './scripts/generate-css.ts';

// The token partials are CSS fragments: bare declarations that
// scripts/generate-css.ts wraps in selectors. oxfmt parses them as whole
// stylesheets and rejects a declaration at the top level.
const staticCheckIgnorePatterns = ['dist/**', '**/*.partial.css'];

export default defineConfig({
  pack: {
    // tsdown 0.23's default, spelled out: without it every `vp migrate` adds back
    // `resolveDepSubpath: true` as a compatibility setting. Same output either way.
    deps: { resolveDepSubpath: false },
    entry: {
      index: 'src/index.ts',
    },
    dts: {
      // The entry is an empty module, so its declaration needs no type checker.
      // Oxc emits it, and the build does not depend on which TypeScript the
      // running vite-plus resolves.
      generator: 'oxc',
    },
    exports: {
      customExports: {
        // Apps that own the page: generic token names on `:root`, plus the
        // Tailwind mapping that reads them.
        './global.css': './dist/global.css',
        './theme-inline.css': './dist/theme-inline.css',
        // Components embedded in someone else's page: the same values under
        // the `--ktn-*` namespace, scoped to `.kaiten`, plus the matching
        // mapping. Both pairs come from the same partials, so they cannot
        // drift apart.
        './scoped.css': './dist/scoped.css',
        './theme-inline-scoped.css': './dist/theme-inline-scoped.css',
      },
    },
    // publint and attw cannot run inside `vp pack` here: the stylesheets above
    // are written by the `build:done` hook below, after pack validation, so
    // both validators would inspect a dist without them. The tarball is checked
    // after the build instead, as pnpm and npm pack it: `check:pack`.
    hooks: {
      'build:done': async (context) => {
        await generateThemeCss(context.options.outDir);
      },
    },
  },
  fmt: {
    ignorePatterns: staticCheckIgnorePatterns,
    printWidth: 80,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
  },
  lint: {
    categories: {
      correctness: 'error',
    },
    ignorePatterns: staticCheckIgnorePatterns,
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
});
