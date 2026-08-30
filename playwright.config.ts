import { defineConfig, devices } from '@playwright/test';

const testPort = 5001;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  outputDir: '/tmp/soleil-playwright-results',
  preserveOutput: 'always',
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${testPort}`,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${testPort} --strictPort`,
    url: `http://localhost:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'desktop-webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile-webkit',
      use: {
        ...devices['iPhone 15 Pro'],
        viewport: { width: 402, height: 874 },
      },
    },
  ],
});
