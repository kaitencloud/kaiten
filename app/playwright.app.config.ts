import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/app',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // The suite runs against the dev server (see webServer below), where a
  // full-page navigation costs ~7s on 2-core CI runners. The heaviest specs
  // chain 5-6 navigations plus a Monaco editor mount, which does not fit
  // Playwright's default 30s test budget. Action/navigation timeouts below
  // still catch genuine hangs.
  timeout: 60_000,
  // See `playwright.config.ts` for rationale on retries / workers / trace.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? '50%' : undefined,
  reporter: process.env.CI
    ? [
        ['html'],
        ['json', { outputFile: 'app-test-results.json' }],
        ['github'],
      ]
    : [
        ['html'],
        ['json', { outputFile: 'app-test-results.json' }],
      ],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    ...(process.env.ALL_BROWSERS === 'true' ? (['firefox', 'webkit'] as const).map((browserName) => ({
      name: browserName,
      testMatch: '**/browser-smoke/*.spec.ts',
      use: { ...devices[browserName === 'firefox' ? 'Desktop Firefox' : 'Desktop Safari'], serviceWorkers: 'block' as const },
    })) : []),
  ],
  webServer: {
    // The KbK pair is pinned EMPTY, not left out: an inline value outranks a
    // shell export or a .env file. One that names a KbK would send the platform
    // flags there, for an organization this auth-bypassed build never signs
    // into: nothing would be evaluated, and every flag would read as off
    // whatever a spec installs.
    command: [
      'VITE_API_URL=/api VITE_LOCAL_AUTH=false VITE_E2E_BYPASS_AUTH=true VITE_E2E_MSW=true',
      'VITE_MOCK_API=false VITE_MOCK_NOTIFICATIONS=false',
      'VITE_KAITEN_PLATFORM_API_URL= VITE_KAITEN_PLATFORM_FLAGS_TOKEN=',
      'vp dev --host 127.0.0.1 --port 3100',
    ].join(' '),
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    timeout: 180 * 1000,
  },
});
