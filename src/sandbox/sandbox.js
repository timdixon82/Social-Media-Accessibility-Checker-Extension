/**
 * Sandboxed extension page — runs outside the extension pages CSP so
 * onnxruntime-web can initialise its WASM backend without CSP restrictions.
 * No chrome.* APIs are available here; all communication is via postMessage.
 *
 * OCR logic lives in adapters/paddle-ocr.js; this file is pure message routing.
 */

import { initOcr, runOcr } from '../adapters/paddle-ocr.js';

// Register the listener BEFORE notifying the parent, so we can never miss
// the 'init' message that the parent sends after receiving 'sandboxLoaded'.
window.addEventListener('message', async (e) => {
  const { type, id, dataUrl, wasmPaths, models } = e.data || {};

  if (type === 'init') {
    try {
      await initOcr({ wasmPaths, models });
      e.source.postMessage({ type: 'ready' }, '*');
    } catch (err) {
      e.source.postMessage({ type: 'initError', error: String(err?.message || err) }, '*');
    }
    return;
  }

  if (type === 'ocr') {
    try {
      const detections = await runOcr(dataUrl);
      e.source.postMessage({ type: 'ocrResult', id, detections }, '*');
    } catch (err) {
      e.source.postMessage({ type: 'ocrResult', id, error: String(err?.message || err) }, '*');
    }
  }
});

// Tell the parent the listener is active. The parent defers sending 'init'
// until it receives this, avoiding the race where 'init' arrives before the
// listener is registered (the bundle is large and takes time to parse).
window.parent?.postMessage({ type: 'sandboxLoaded' }, '*');
