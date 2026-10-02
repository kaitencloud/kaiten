/// <reference types="vite-plus" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from 'vite-plus/test/browser-playwright';
import { visualizer } from 'rollup-plugin-visualizer';

// Base UI is private to `src/components/ui`: every other file consumes the
// wrappers that live there, so a primitive can be swapped or restyled in one
// place. `pnpm run lint` and CI run from inside app/, which makes this the
// config that applies; keep it in step with the same rule in the root
// vite.config.ts, which `vp check` and a bare `vp lint` use.
const headlessUiImports = {
  patterns: [
    {
      group: ['@base-ui/**'],
      message:
        'Only src/components/ui may import Base UI. Use the wrapper from @/components/ui instead, or add one there.',
    },
  ],
};

// Routes are thin assemblers (app/docs/03-patterns/routes-as-assemblers.md): a
// route file loads data and renders a feature, it does not own mutations or UI
// state. Those two are the documented "never in a route" items that an import
// can express; the rest (business logic, data shaping, detailed JSX) is for
// review. Kept in step with the same rule in the root vite.config.ts.
const routeMutationImport = {
  name: '@tanstack/react-query',
  importNames: ['useMutation'],
  message:
    'Routes only assemble features: put the mutation in a hook under src/features/<name>.',
};
const routeUiStateImport = {
  name: 'react',
  importNames: ['useState', 'useReducer'],
  message:
    'Routes only assemble features: keep UI state in the feature component. Only src/routes/-components (the app shell) may hold local state.',
};

const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const staticCheckIgnorePatterns = [
  'out/**',
  '.vercel/**',
  'dist/**',
  'worker-configuration.d.ts',
  'public/**',
  '**/*.stories.ts',
  '**/*.stories.tsx',
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/routeTree.gen.ts',
  '**/src/api-client/**',
  '**/src/components/ui/**',
  '**/src/styles.css',
  'src/components/ui/**',
  'src/api-client/**',
  '**/stories/**',
  'src/styles.css',
];

const staticFmtIgnorePatterns = [
  ...staticCheckIgnorePatterns,
  '**/*.queries.ts',
];

// Stories whose component behaviour is covered by E2E (coupled to
// Router/Form/Query/API, or pulling heavy deps like recharts/monaco-CEL).
// Excluded from the storybook *browser test* so the vitest runner never
// imports them — keeping the browser suite lean and avoiding overlap with
// E2E. They remain available in Storybook (visual/docs) as usual.
const storybookTestExclude = [
  'src/features/connectors/components/stories/connectors.stories.tsx',
  'src/features/customers/components/stories/customer-detail.stories.tsx',
  'src/features/customers/components/stories/customer-form-dialog.stories.tsx',
  'src/features/dashboard/components/stories/dashboard.stories.tsx',
  'src/features/deployment-zones/components/stories/deploy-release-dialog.stories.tsx',
  'src/features/deployment-zones/components/stories/deployment-zone-form-dialog.stories.tsx',
  'src/features/deployment-zones/components/stories/deployment-zone-table.stories.tsx',
  'src/features/entitlements/components/entitlement-detail/stories/entitlement-detail.stories.tsx',
  'src/features/entitlements/components/form/stories/entitlement-form-dialog.stories.tsx',
  'src/features/feature-flags/components/feature-flag-form/stories/feature-flag-form.stories.tsx',
  'src/features/feature-flags/targeting/components/stories/targeting-form-dialog.stories.tsx',
  'src/features/feature-flags/variants/components/stories/variant-list.stories.tsx',
  'src/features/instances/components/stories/instance-form-dialog.stories.tsx',
  'src/features/instances/components/stories/instance-overview-and-audit.stories.tsx',
  'src/features/licenses/components/stories/license-table.stories.tsx',
  'src/features/releases/components/stories/release-form.stories.tsx',
  'src/features/releases/components/stories/release-table.stories.tsx',
  'src/features/settings/components/stories/settings-page-content.stories.tsx',
  'src/features/webhooks/components/stories/webhooks.stories.tsx',
  'src/functionals/cel-editor/stories/cel-editor.stories.tsx',
  'src/functionals/stacked-form-dialog/stories/stacked-form-dialog.stories.tsx',
  'src/functionals/step-stack/stories/step-stack.stories.tsx',
  'src/routes/-components/path-breadcrumbs/stories/path-breadcrumbs.stories.tsx',
];

// Serves <dev dir>/tokens.json as a virtual ESM module in dev mode.
// In production the module resolves to an empty array — fully tree-shaken.
//
// <dev dir> is KAITEN_DEV_DIR when set, ../dev (this app's own sibling
// directory) otherwise. The override matters when this app runs against
// another stack than this repo's own: that stack's compose writes tokens to
// its own dev/ directory, not this repo's -- without KAITEN_DEV_DIR, this
// plugin would silently read whichever stack was seeded here most recently
// instead of the one actually running.
function devTokensPlugin() {
  const virtualId = 'virtual:dev-tokens';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'dev-tokens',
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    load(id: string) {
      if (id !== resolvedId) return;
      if (process.env.NODE_ENV === 'production') return 'export default []';
      try {
        const devDir = process.env.KAITEN_DEV_DIR ?? resolve(dirname, '../dev');
        const tokensPath = resolve(devDir, 'tokens.json');
        return `export default ${readFileSync(tokensPath, 'utf-8')}`;
      } catch {
        return 'export default []';
      }
    },
  };
}

// Serves the installed Tailwind's theme.css as a string. A `?raw` import would
// do the same in dev, but resolves to an empty string under vitest — this
// virtual module works in every mode the app builds in, and keeps the palette
// pinned to whatever tailwindcss version is actually installed.
function tailwindThemePlugin() {
  const virtualId = 'virtual:tailwind-theme-css';
  const resolvedId = '\0' + virtualId;

  return {
    name: 'tailwind-theme-css',
    resolveId(id: string) {
      if (id === virtualId) return resolvedId;
    },
    load(id: string) {
      if (id !== resolvedId) return;
      const themePath = require.resolve('tailwindcss/theme.css');
      return `export default ${JSON.stringify(readFileSync(themePath, 'utf-8'))}`;
    },
  };
}

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  fmt: {
    ignorePatterns: staticFmtIgnorePatterns,
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
    plugins: ['typescript', 'react', 'unicorn', 'oxc'],
    rules: {
      // File names are kebab-case. Directories are not checked, and a leading
      // `_` is ignored by the rule, which is what TanStack's `__root.tsx` needs.
      // `$param` route files (routes/**/$connectorId.tsx) follow the router's
      // dynamic-segment naming, which cannot be kebab-cased, hence the ignore.
      'unicorn/filename-case': [
        'error',
        { case: 'kebabCase', ignore: ['^\\$'] },
      ],
      'no-restricted-imports': ['error', headlessUiImports],
      'no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'no-template-curly-in-string': 'off',
      'react/no-danger': 'off',
      'react/exhaustive-deps': 'off',
      'react/react-in-jsx-scope': 'off',
      'typescript/no-base-to-string': 'off',
      'typescript/no-explicit-any': 'off',
      'typescript/no-floating-promises': 'off',
      'typescript/no-meaningless-void-operator': 'off',
      'typescript/no-non-null-assertion': 'off',
      'typescript/no-redundant-type-constituents': 'off',
      'typescript/unbound-method': 'off',
    },
    overrides: [
      {
        files: ['src/components/ui/**'],
        rules: { 'no-restricted-imports': 'off' },
      },
      {
        files: ['src/routes/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            {
              ...headlessUiImports,
              paths: [routeMutationImport, routeUiStateImport],
            },
          ],
        },
      },
      {
        // The app shell (side nav, breadcrumbs) lives in routes/-components and
        // keeps local state; mutations stay out of it like everywhere else.
        files: ['src/routes/-components/**'],
        rules: {
          'no-restricted-imports': [
            'error',
            { ...headlessUiImports, paths: [routeMutationImport] },
          ],
        },
      },
    ],
    settings: {
      react: {
        version: '19.2.0',
      },
    },
  },
  plugins: [
    devTokensPlugin(),
    tailwindThemePlugin(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
    // Only run visualizer when explicitly requested: `ANALYZE=true vp build`
    ...(process.env.ANALYZE === 'true'
      ? [
          visualizer({
            open: true,
            gzipSize: true,
            brotliSize: true,
            filename: 'dist/stats.html',
          }),
        ]
      : []),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 10000,
    // 10 seconds max per test
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/api-client/**',
      '**/routeTree.gen.ts',
      '**/e2e/**', // Exclude E2E tests from unit tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/api-client/**',
        '**/routeTree.gen.ts',
        '**/e2e/**',
        '**/__tests__/**',
        '**/src/components/ui/**', // Exclude shadcn/ui components (external library)
        '**/routes/**', // Exclude route forms (tested via Storybook + Playwright)
        '**/*.stories.tsx', // Exclude stories files themselves
      ],
    },
    projects: [
      // Unit tests project
      {
        extends: true,
        test: {
          name: 'unit',
          include: [
            'src/**/*.test.{ts,tsx}',
            'scripts/**/*.test.ts',
          ],
        },
      },
      // Storybook tests project
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          // Cast: the addon types its plugins against stock vite, and tsgo
          // (TS7) blows its comparison depth against vite-plus-core 0.2.5's
          // PluginOption union.
          storybookTest({
            configDir: path.join(dirname, '.storybook'),
          }) as unknown as import('vite-plus').PluginOption,
        ],
        test: {
          name: 'storybook',
          // Keep the browser suite lean: don't collect/import E2E-covered
          // (Router/Form/Query/chart/CEL) stories. The addon-vitest plugin
          // merges this with its own defaults.
          exclude: ['**/node_modules/**', '**/dist/**', ...storybookTestExclude],
          // Reuse one browser context across story files instead of a fresh
          // iframe per file. The per-file iframe churn is what intermittently
          // throws "Cannot connect to the iframe" on CI under load (the error
          // persists even with a warm optimizer cache, so it's a connection
          // issue, not the dep-optimizer reload). Storybook's vitest-addon docs
          // recommend isolate:false for exactly this.
          isolate: false,
          browser: {
            enabled: true,
            headless: true,
            // Storybook sizes each story to 1200x900 through the deprecated
            // `@vitest/browser/context` import, which Vitest 5 no longer serves, and
            // addon-vitest 10.6 swallows the failure: stories fell back to Vitest's
            // 414x896 and rendered their mobile layouts. Same size, set here. Drop it
            // once @storybook/addon-vitest supports Vitest 5 (storybookjs/storybook#36221).
            viewport: { width: 1200, height: 900 },
            provider: playwright(),
            instances: [
              {
                browser: 'chromium',
              },
            ],
          },
          setupFiles: ['.storybook/vitest.setup.ts'],
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(dirname, './src'),
    },
  },
  optimizeDeps: {
    // Pre-bundle the two monaco entry points code-editor.tsx actually
    // imports. optimizeDeps only affects the dev server (prod tree-shaking
    // happens in rolldown regardless): without this, monaco's ~1100 ESM
    // modules are transformed on demand — every page that mounts a CEL/JSON
    // editor re-fetches them all, which saturates the dev server on 2-core
    // CI runners and times out the e2e app suite.
    include: [
      '@base-ui/react/input',
      '@base-ui/react/merge-props',
      '@monaco-editor/react',
      'monaco-editor/esm/vs/editor/editor.api',
      'monaco-editor/esm/vs/language/json/monaco.contribution',
      'recharts',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        // Manual chunk splitting for better caching
        // Note: lucide-react icons are automatically tree-shaken because
        // all imports use named imports (e.g., import { Icon } from 'lucide-react')
        // rather than wildcard imports (e.g., import * as Icons)
        manualChunks: (id) => {
          // Isolate the runtime config so the entrypoint can target it with
          // envsubst. Its hash covers placeholders, so its URL is stable across
          // builds while its content changes at every start: nginx serves it
          // with no-cache. The name was env-config while nginx cached it as
          // immutable; renaming it gave every browser a URL it had not cached.
          if (id.includes('/src/env')) {
            return 'runtime-config';
          }
          // monaco-editor is only reachable through dynamic import() in
          // code-editor.tsx; returning undefined (instead of a chunk name or
          // falling through to the vendor catch-all) lets default chunking
          // keep it in a lazy chunk. Forcing a manual 'monaco' chunk made
          // rolldown park vite's preload-helper — a virtual module that
          // manualChunks cannot reassign — inside it, which turned the
          // 3.7 MB editor bundle into a static dependency of the entrypoint.
          if (id.includes('monaco-editor')) {
            return undefined;
          }
          // React core — regex anchored on the package name so that packages
          // like @clerk/react or lucide-react are NOT included.
          // Works with pnpm virtual store paths:
          //   …/.pnpm/react@19.x/node_modules/react/index.js  ✓
          //   …/.pnpm/@clerk+react@…/node_modules/@clerk/react/ ✗
          if (
            /node_modules\/(react|react-dom|react-is|scheduler)([\/.]|$)/.test(
              id,
            )
          ) {
            return 'react-vendor';
          }
          // Clerk auth libraries — large, change independently from React
          if (id.includes('/@clerk/') || id.includes('/node_modules/@clerk/')) {
            return 'clerk';
          }
          // TanStack libraries (router, query, table, form)
          if (id.includes('@tanstack')) {
            return 'tanstack';
          }
          // Base UI primitives
          if (id.includes('@base-ui')) {
            return 'base-ui';
          }
          // Chart libraries
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          // CodeMirror (JsonField's editor) is only reachable through
          // React.lazy boundaries (hooks/form.ts); a dedicated chunk keeps
          // its ~700 kB out of the eager vendor bundle.
          if (
            /node_modules\/(@codemirror|@lezer|@uiw|codemirror|crelt|style-mod|w3c-keyname)\//.test(
              id,
            )
          ) {
            return 'codemirror';
          }
          // ajv (JSON Schema validation for metadata fields) and the cel-js
          // parser stack are only used by feature code, not the app shell.
          if (
            /node_modules\/(ajv|ajv-formats|fast-uri|json-schema-traverse)\//.test(
              id,
            )
          ) {
            return 'ajv';
          }
          if (/node_modules\/(cel-js|chevrotain|@chevrotain)\//.test(id)) {
            return 'cel';
          }
          // Other vendor libraries
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
    // Raised: react-vendor is legitimately large; warn above 1500 kB instead.
    chunkSizeWarningLimit: 1500,
  },
});
