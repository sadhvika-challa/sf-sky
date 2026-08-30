import { defineConfig, devices } from '@playwright/test';

const testPort = Number(process.env.SOLEIL_PWA_PLAYWRIGHT_PORT ?? 5002);

export default defineConfig({
  testDir: './e2e/pwa',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: '/tmp/soleil-pwa-playwright-results',
  preserveOutput: 'always',
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${testPort}`,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://localhost:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'pwa-chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
