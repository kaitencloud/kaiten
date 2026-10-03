import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/bootstrap',
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  outputDir: 'bootstrap-test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'bootstrap-playwright-report' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3102',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'dev-mock', testMatch: '**/dev-mock.spec.ts' },
    ...(process.env.CEL_WASM_SMOKE === 'true'
      ? [{ name: 'cel-wasm', testMatch: '**/cel-wasm.spec.ts' }]
      : []),
  ],
  webServer: {
    command: 'VITE_E2E_MSW=false VITE_MOCK_NOTIFICATIONS=false pnpm run dev:mock --host 127.0.0.1 --port 3102 --strictPort',
    url: 'http://127.0.0.1:3102',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
