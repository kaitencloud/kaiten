import { defineConfig } from 'vite-plus';

// Radix UI and Base UI are private to `app/src/components/ui`: every other
// file consumes the wrappers that live there, so a primitive can be swapped or
// restyled in one place. Kept in step with the same rule in app/vite.config.ts,
// which is the config `pnpm run lint` picks up from inside app/.
const headlessUiImports = {
  patterns: [
    {
      group: ['radix-ui', 'radix-ui/**', '@radix-ui/**', '@base-ui/**'],
      message:
        'Only src/components/ui may import Radix UI or Base UI. Use the wrapper from @/components/ui instead, or add one there.',
    },
  ],
};

// Routes are thin assemblers (app/docs/03-patterns/routes-as-assemblers.md): a
// route file loads data and renders a feature, it does not own mutations or UI
// state. Those two are the documented "never in a route" items that an import
// can express; the rest (business logic, data shaping, detailed JSX) is for
// review. Kept in step with the same rule in app/vite.config.ts.
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

export default defineConfig({
  fmt: {
    // A whitelist, not a deny-list, and the order matters: gitignore-style
    // matching, so ignore the repo wholesale then re-open only the TS/JS source
    // roots. Two reasons it has to be this way round:
    //
    //  1. oxfmt formats Markdown, YAML, GraphQL, HTML and JSON too, so a bare
    //     `vp fmt` reaches the Go API's .graphqls schemas, the Helm charts, the
    //     CI workflows and the Markdown in this repository -- none of which this
    //     toolchain owns (gofmt, helm and prettier-free prose do).
    //  2. A deny-list silently re-opens the door every time someone adds a
    //     top-level directory. Anything new is ignored here until it is named.
    //
    // Keep this in step with the `fmt` / `fmt:check` scripts in package.json:
    // those pass explicit globs, and these patterns are what make the bare
    // built-in `vp fmt` and `vp check` behave identically to them.
    ignorePatterns: [
      '/*',
      '!/app',
      '/app/*',
      '!/app/src',
      '!/app/e2e',
      '!/packages',
      '/packages/*',
      '!/packages/theme',
      '/packages/theme/*',
      '!/packages/theme/src',
      '!/packages/theme/scripts',

      // Only the six extensions the `fmt` script globs are ours. Re-opening a
      // source root above also exposes the prose and config files sitting in it
      // (feature READMEs, e2e guides), which oxfmt would happily rewrite --
      // last match wins in gitignore matching, so these come after the
      // whitelist. Opt a type back in here if the team ever wants it.
      '**/*.md',
      '**/*.json',
      '**/*.jsonc',
      '**/*.css',
      '**/*.html',
      '**/*.yml',
      '**/*.yaml',
      '**/*.graphql',
      '**/*.graphqls',

      // Generated or vendored: owned by a codegen step or copied in upstream.
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.vercel/**',
      'app/src/api-client/**',
      'app/src/components/ui/**',
      'app/**/*.queries.ts',
      'app/src/styles.css',
      'app/**/routeTree.gen.ts',

      // Tests and stories are deliberately left alone, matching the `fmt`
      // script's `!**/*.test.ts` family of exclusions.
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.stories.ts',
      '**/*.stories.tsx',
      '**/stories/**',
    ],
    printWidth: 80,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
  },
  lint: {
    categories: {
      correctness: 'error',
    },
    // Same whitelist as `fmt` above, for the same reason: a bare `vp lint` or
    // `vp check` otherwise type-aware-lints every .ts it can reach, including
    // build and tooling config outside the source roots that CI never checks
    // (app/.storybook, app/scripts, app/*.config.ts, packages/api-codegen).
    // Mirrors the paths the `lint` script passes explicitly.
    ignorePatterns: [
      '/*',
      '!/app',
      '/app/*',
      '!/app/src',
      '!/app/e2e',
      '!/packages',
      '/packages/*',
      '!/packages/theme',
      '/packages/theme/*',
      '!/packages/theme/src',
      '!/packages/theme/scripts',

      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '**/.vercel/**',
      '**/*.stories.ts',
      '**/*.stories.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/routeTree.gen.ts',
      '**/src/api-client/**',
      '**/src/components/ui/**',
      '**/src/styles.css',
      'app/worker-configuration.d.ts',
      'app/src/api-client/**',
      'app/src/components/ui/**',
      'app/src/styles.css',
      'app/**/stories/**',
      'app/**/routeTree.gen.ts',
    ],
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
        files: ['app/src/components/ui/**'],
        rules: { 'no-restricted-imports': 'off' },
      },
      {
        files: ['app/src/routes/**'],
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
        files: ['app/src/routes/-components/**'],
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
});
