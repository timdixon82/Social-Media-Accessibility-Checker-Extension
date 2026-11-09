/**
 * Sandboxed extension page — runs outside the extension pages CSP so
 * onnxruntime-web can initialise its WASM backend without CSP restrictions.
 * No chrome.* APIs are available here; all communication is via postMessage.
 *
 * OCR logic lives in adapters/paddle-ocr.js; this file is pure message routing.
 */

import { initOcr, runOcr } from '../adapters/paddle-ocr.js';

// The parent sends one 'init' message carrying a transferred MessagePort. All
// later traffic (OCR requests, results, ready and error notices) uses that
// private port, so no postMessage target origin is needed. This page has an
// opaque origin, which no target origin string can match.
let port = null;

// Register the listener BEFORE notifying the parent, so we can never miss
// the 'init' message that the parent sends after receiving 'sandboxLoaded'.
window.addEventListener('message', (e) => { // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation: chrome.runtime.getURL is unavailable in a sandboxed page; e.source === window.parent is the equivalent guard, and the parent's reply channel is a transferred port.
  // Only accept messages from the direct parent frame.
  if (e.source !== window.parent) return;
  // Accept exactly one init; ignore any later one.
  if (port) return;

  const { type, wasmPaths, models } = e.data || {};
  if (type !== 'init' || e.ports.length !== 1) return;
  if (typeof wasmPaths !== 'string' || !models) return;
  const { detectionPath, recognitionPath, dictionaryPath } = models;
  if (![detectionPath, recognitionPath, dictionaryPath].every((v) => typeof v === 'string')) return;

  port = e.ports[0];
  port.onmessage = async (m) => {
    const { type: t, id, dataUrl } = m.data || {};
    if (t !== 'ocr' || typeof id !== 'number') return;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return;
    try {
      port.postMessage({ type: 'ocrResult', id, detections: await runOcr(dataUrl) });
    } catch (err) {
      port.postMessage({ type: 'ocrResult', id, error: String(err?.message || err) });
    }
  };

  initOcr({ wasmPaths, models })
    .then(() => port.postMessage({ type: 'ready' }))
    .catch((err) => port.postMessage({ type: 'initError', error: String(err?.message || err) }));
});

// Tell the parent the listener is active. The parent defers sending 'init'
// until it receives this, avoiding the race where 'init' arrives before the
// listener is registered (the bundle is large and takes time to parse).
// '*' is the only option: the parent cannot be addressed by origin string
// from here, and this bootstrap message carries no data.
window.parent?.postMessage({ type: 'sandboxLoaded' }, '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration: bootstrap message, no data.
