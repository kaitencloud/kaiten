import { defineConfig, devices } from '@playwright/test';

const port = process.env.STACK_APP_PORT;
const api = process.env.STACK_API_URL;
if (!port || !api || !process.env.STACK_TOKENS_FILE)
  throw new Error('Run pnpm run test:e2e:stack');

export default defineConfig({
  testDir: './e2e/stack',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'stack-playwright-report', open: 'never' }],
  ],
  outputDir: 'stack-test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `vp dev --host 127.0.0.1 --port ${port}`,
    env: {
      VITE_API_URL: `${api}/api`,
      VITE_LOCAL_AUTH: 'true',
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
