// Accessibility tests for the SMACE Chrome extension popup and report page.
//
// These tests load the built extension in Chromium using Playwright's
// launchPersistentContext with --load-extension. The extension must be built
// before running these tests:
//
//   npm run build
//   npx playwright test tests/accessibility/
//
// The extension popup and report page are accessed at their chrome-extension://
// URLs, which are discovered at runtime from the registered service worker.
//
// axe-core runs at WCAG 2.2 AAA (tags: wcag2a, wcag2aa, wcag2aaa, wcag22aa,
// wcag22aaa). Each test reports the full list of violations on failure so
// findings are actionable without re-running locally.
//
// Known violations from Carol's 2026-05-23 baseline audit are listed in
// docs/accessibility.md. When a known violation is fixed, remove it from
// that list. When a new violation is found, add it there.

'use strict';

const path = require('path');
const { chromium, test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag2aaa', 'wcag22aa', 'wcag22aaa'];

// Run tests in serial because they share a single browser context.
test.describe.configure({ mode: 'serial' });

let browserContext;
let extensionId;

test.beforeAll(async () => {
  // launchPersistentContext with an empty user-data-dir string works in CI
  // (Playwright creates a temporary directory). The --no-sandbox flag is
  // required on GitHub-hosted runners.
  //
  // headless: false tells Playwright not to inject its own legacy headless
  // flag, which suppresses Chrome extension service workers. --headless=new
  // passes Chrome's own new headless mode, which supports service workers.
  // In CI, xvfb-run provides the required virtual framebuffer. Locally, a
  // real display is used.
  browserContext = await chromium.launchPersistentContext('', {
    headless: false,
    // --headless=new tells Chrome to use its own new headless mode, which
    // supports extension service workers. headless: false tells Playwright
    // not to apply its own (legacy) headless flag. xvfb-run in CI provides
    // the required display; locally a real display is used.
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });

  // Discover the extension ID from the service worker URL.
  // The service worker registers immediately after the extension loads.
  // 30 000 ms is used instead of the default 15 000 ms because GitHub-hosted
  // CI runners are slower to initialise the Chrome extension environment.
  let [background] = browserContext.serviceWorkers();
  if (!background) {
    background = await browserContext.waitForEvent('serviceworker', { timeout: 30000 });
  }
  // Service worker URL shape: chrome-extension://<id>/background/service_worker.js
  extensionId = background.url().split('/')[2];
});

test.afterAll(async () => {
  await browserContext.close();
});

// ── Popup ────────────────────────────────────────────────────────────────────

test('popup has no WCAG 2.2 AAA violations', async () => {
  const page = await browserContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    if (results.violations.length > 0) {
      // Print a compact summary to make CI output actionable.
      const summary = results.violations.map((v) =>
        `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      ).join('\n');
      console.error(`Popup violations:\n${summary}`);
    }

    expect(
      results.violations,
      `Popup has ${results.violations.length} WCAG violation(s). See docs/accessibility.md for the known list.`
    ).toHaveLength(0);
  } finally {
    await page.close();
  }
});

// ── Report page (initial empty state) ────────────────────────────────────────

test('report page in initial state has no WCAG 2.2 AAA violations', async () => {
  const page = await browserContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/app/app.html`);
    await page.waitForLoadState('domcontentloaded');

    const results = await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze();

    if (results.violations.length > 0) {
      const summary = results.violations.map((v) =>
        `  [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`
      ).join('\n');
      console.error(`Report page violations:\n${summary}`);
    }

    expect(
      results.violations,
      `Report page has ${results.violations.length} WCAG violation(s). See docs/accessibility.md for the known list.`
    ).toHaveLength(0);
  } finally {
    await page.close();
  }
});
