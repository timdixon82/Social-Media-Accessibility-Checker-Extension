// OCR end-to-end tests for the SMACE Chrome extension.
//
// These tests load the built extension (dist/) and drive the app page's real
// OCR path: app page -> MessageChannel port -> sandboxed page -> PaddleOCR.
// They guard against the regression where the app's messages to the opaque-
// origin sandbox were silently dropped (bad postMessage target origin).
//
// Test-only hook: app.js exposes window.__smaceTest.runOcr only when the page
// URL carries ?test=1. See the comment in src/app/app.js for why this is safe.
//
//   npm run build
//   npx playwright test tests/ocr/

'use strict';

const path = require('path');
const { chromium, test, expect } = require('@playwright/test');

const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

// Model start-up is about 1 s and one OCR pass a few seconds locally. CI
// runners are slower, so allow a generous budget for the whole test.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120000);

let browserContext;
let extensionId;

test.beforeAll(async () => {
  browserContext = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-sandbox',
    ],
  });
  let [background] = browserContext.serviceWorkers();
  if (!background) {
    background = await browserContext.waitForEvent('serviceworker', { timeout: 30000 });
  }
  extensionId = background.url().split('/')[2];
});

test.afterAll(async () => {
  await browserContext.close();
});

test('OCR through the app page reads text drawn on a canvas', async () => {
  const page = await browserContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/app/app.html?test=1`);
    await page.waitForFunction(() => typeof window.__smaceTest?.runOcr === 'function');

    const text = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1000;
      canvas.height = 160;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 80px Arial, Helvetica, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('ACCESSIBILITY CHECK', 30, 80);
      const detections = await window.__smaceTest.runOcr(canvas.toDataURL('image/png'));
      return detections.map((d) => d.text).join(' ');
    });

    expect(text.toLowerCase().replace(/\s+/g, '')).toContain('accessibilitycheck');
  } finally {
    await page.close();
  }
});

test('a raw ocr postMessage sent to the sandbox frame gets no reply', async () => {
  const page = await browserContext.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/app/app.html?test=1`);
    await page.waitForFunction(() => typeof window.__smaceTest?.runOcr === 'function');
    // Let the handshake finish first, so the sandbox is fully initialised and
    // would answer a raw message if it were (wrongly) listening for one.
    await page.evaluate(() => window.__smaceTest.ready());

    const replies = await page.evaluate(() => new Promise((resolve) => {
      const seen = [];
      window.addEventListener('message', (e) => {
        if (e.data?.type === 'ocrResult') seen.push(e.data);
      });
      const frame = document.querySelector('iframe');
      frame.contentWindow.postMessage({ type: 'ocr', id: 1, dataUrl: 'data:image/png;base64,AAAA' }, '*');
      setTimeout(() => resolve(seen), 5000);
    }));

    expect(replies).toHaveLength(0);
  } finally {
    await page.close();
  }
});
