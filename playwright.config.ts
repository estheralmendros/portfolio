import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4321/portfolio/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Serves dist-test/ (fixture content). Run `npm run build:test` first.
    // --ignore-lock keeps astro preview in the foreground (Astro 7 auto-backgrounds it when run by an AI agent).
    command: 'npx astro preview --port 4321 --ignore-lock',
    env: { CONTENT_DIR: 'tests/fixtures/content' },
    url: 'http://localhost:4321/portfolio/',
    reuseExistingServer: false, // never reuse: a server on 4321 may be serving the real dist/
    timeout: 60_000,
  },
});
