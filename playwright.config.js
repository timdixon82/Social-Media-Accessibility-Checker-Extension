// Playwright configuration for SMACE accessibility tests.
// Tests run the built Chrome extension in Chromium using launchPersistentContext,
// which is required for --load-extension to work. The test files manage the
// browser context directly; this config sets shared timeouts and reporting.

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 45000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  // No shared `use` block — the accessibility tests set up their own
  // launchPersistentContext with --load-extension. Playwright's default
  // browser fixture is not used for extension tests.
});
