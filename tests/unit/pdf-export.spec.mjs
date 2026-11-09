// Regression test: buildPdf must resolve with a PDF Blob.
// pdfmake 0.3 getBlob() takes no callback and returns a promise, so passing
// a callback left buildPdf pending forever.
import { test, expect } from '@playwright/test';
import { buildPdf } from '../../src/export/pdf.js';

test('buildPdf resolves with a PDF blob', async () => {
  test.setTimeout(20000);
  const post = { url: 'https://example.com/post', text: 'Hello', platform: 'test' };
  const blob = await buildPdf(post, [], '2026-01-01T00:00:00Z');
  expect(blob.type).toBe('application/pdf');
  expect(blob.size).toBeGreaterThan(0);
  const head = Buffer.from(await blob.slice(0, 5).arrayBuffer()).toString('latin1');
  expect(head).toBe('%PDF-');
});
