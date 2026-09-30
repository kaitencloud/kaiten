import { defineConfig, devices } from '@playwright/test';

const storybookPort = 6006;
const useStaticStorybook =
  !!process.env.CI ||
  process.env.VISUAL_TESTS === 'true' ||
  process.env.PLAYWRIGHT_STORYBOOK_STATIC === 'true';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  expect: {
    timeout: 15_000, // Storybook stories take time to render
    toHaveScreenshot: {
      // Store a single baseline per Playwright project so developers can
      // generate Chromium snapshots locally and reuse them in Linux CI.
      pathTemplate:
        '{testDir}/{testFilePath}-snapshots{/projectName}/{arg}{ext}',
      // Allow up to 0.1% pixel difference to tolerate font rendering
      // variations between CI (Linux) and developer machines (macOS).
      maxDiffPixelRatio: 0.001,
    },
  },
  forbidOnly: !!process.env.CI,
  // Single retry in CI: hides genuine flakes less than 2 retries while still
  // tolerating the occasional infra hiccup. Combined with `trace: 'retain-on-failure'`,
  // every failure produces a trace immediately instead of waiting for a retry.
  retries: process.env.CI ? 1 : 0,
  // `fullyParallel: true` is wasted with workers=1. 50% of cores in CI keeps the
  // runner stable while exploiting parallelism. Locally `undefined` lets
  // Playwright auto-detect.
  workers: process.env.CI ? '50%' : undefined,
  reporter: process.env.CI
    ? [
        ['html'],
        ['json', { outputFile: 'test-results.json' }],
        ['github'],
      ]
    : [
        ['html'],
        ['json', { outputFile: 'test-results.json' }],
      ],
  use: {
    baseURL: `http://127.0.0.1:${storybookPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Raise the timeouts for the E2E tests
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
  projects: [
    // Chromium runs by default
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Other browsers only run when ALL_BROWSERS=true or in CI
    // This significantly speeds up test execution during development
    ...(process.env.ALL_BROWSERS === 'true' || process.env.CI ? [
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
      {
        name: 'Mobile Chrome',
        use: { ...devices['Pixel 5'] },
      },
    ] : []),
  ],
  webServer: {
    command: useStaticStorybook
      ? `./node_modules/.bin/storybook build && python3 -m http.server ${storybookPort} --bind 127.0.0.1 -d storybook-static`
      : `./node_modules/.bin/storybook dev -p ${storybookPort}`,
    url: `http://127.0.0.1:${storybookPort}`,
    reuseExistingServer: !useStaticStorybook && !process.env.CI,
    timeout: 180 * 1000, // Storybook can take longer to boot
    env: {
      // The static Storybook build runs in Vite production mode, where
      // `src/env.ts` throws if VITE_API_URL is missing (e.g. CI Docker has
      // no .env file). Stories never hit the network, so a local placeholder
      // is enough to let api-client modules load.
      VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:3001/api',
    },
  },
});
