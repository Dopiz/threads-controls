// @ts-check
const { defineConfig } = require('@playwright/test');

// Two suites:
//  - unit: loads the content scripts into a local page with a stubbed chrome.*
//    API and synthetic DOM/events. No network, deterministic — run on every change.
//  - e2e: loads the unpacked extension into Chromium and drives the live sites
//    (logged-out) from tests/e2e/urls.js. Depends on third-party pages that can
//    change or disappear, so it skips (not fails) when a fixture is gone.
module.exports = defineConfig({
  timeout: 30_000,
  reporter: [['list']],
  projects: [
    {
      name: 'unit',
      testDir: './tests/unit',
      fullyParallel: true,
      use: {
        headless: true,
        viewport: { width: 1280, height: 720 },
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
      }
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      timeout: 90_000,
      retries: 1,
      // One browser per worker; the live sites rate-limit parallel logged-out traffic.
      workers: 1
    }
  ]
});
