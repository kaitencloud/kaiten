import { defineConfig, devices } from '@playwright/test';

const port = process.env.STACK_APP_PORT;
const api = process.env.STACK_API_URL;
const reportDir = process.env.STACK_REPORT_DIR;
const resultsDir = process.env.STACK_RESULTS_DIR;
const jsonReport = process.env.STACK_JSON_REPORT;
if (!port || !api || !process.env.STACK_TOKENS_FILE || !reportDir || !resultsDir || !jsonReport)
  throw new Error('Run pnpm run test:e2e:stack');

export default defineConfig({
  testDir: './e2e/stack',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['json', { outputFile: jsonReport }],
    ['html', { outputFolder: reportDir, open: 'never' }],
  ],
  outputDir: resultsDir,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    // Authenticated traces can contain JWTs; no safe publication/redaction contract yet.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `vp dev --host 127.0.0.1 --port ${port}`,
    env: {
      VITE_API_URL: `${api}/api`,
      VITE_LOCAL_AUTH: 'true',
      VITE_CLERK_PUBLISHABLE_KEY: '',
      VITE_E2E_BYPASS_AUTH: 'false',
      VITE_E2E_MSW: 'false',
      VITE_MOCK_API: 'false',
      VITE_MOCK_NOTIFICATIONS: 'false',
      VITE_KAITEN_PLATFORM_API_URL: '',
      VITE_KAITEN_PLATFORM_FLAGS_TOKEN: '',
    },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
