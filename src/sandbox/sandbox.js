/**
 * Sandboxed extension page — runs outside the extension pages CSP so
 * onnxruntime-web can initialise its WASM backend without CSP restrictions.
 * No chrome.* APIs are available here; all communication is via postMessage.
 *
 * OCR logic lives in adapters/paddle-ocr.js; this file is pure message routing.
 */

import { initOcr, runOcr } from '../adapters/paddle-ocr.js';

// Trusted origin for postMessage replies.  Populated from the 'init' message
// sent by the parent app page, which includes its own window.location.origin.
// Validated to start with 'chrome-extension://' before being stored.
// Until 'init' arrives the value is null and replies fall back to '*'; that
// window is extremely short (a single round-trip after sandboxLoaded).
let trustedOrigin = null;

// Register the listener BEFORE notifying the parent, so we can never miss
// the 'init' message that the parent sends after receiving 'sandboxLoaded'.
window.addEventListener('message', async (e) => { // nosemgrep: javascript.browser.security.insufficient-postmessage-origin-validation.insufficient-postmessage-origin-validation — chrome.runtime.getURL is unavailable in a sandboxed page; e.source === window.parent is the equivalent origin guard for same-extension iframes.
  // Only accept messages from the direct parent frame.
  if (e.source !== window.parent) return;

  const { type, id, dataUrl, wasmPaths, models, extensionOrigin } = e.data || {};

  if (type === 'init') {
    // Store the extension origin supplied by the parent so replies can be
    // targeted precisely.  Reject anything that does not look like a
    // chrome-extension:// origin to prevent a compromised page from
    // redirecting replies.
    if (typeof extensionOrigin === 'string' && extensionOrigin.startsWith('chrome-extension://')) {
      trustedOrigin = extensionOrigin;
    }
    try {
      await initOcr({ wasmPaths, models });
      e.source.postMessage({ type: 'ready' }, trustedOrigin || '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    } catch (err) {
      e.source.postMessage({ type: 'initError', error: String(err?.message || err) }, trustedOrigin || '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    }
    return;
  }

  if (type === 'ocr') {
    try {
      const detections = await runOcr(dataUrl);
      e.source.postMessage({ type: 'ocrResult', id, detections }, trustedOrigin || '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    } catch (err) {
      e.source.postMessage({ type: 'ocrResult', id, error: String(err?.message || err) }, trustedOrigin || '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
    }
  }
});

// Tell the parent the listener is active. The parent defers sending 'init'
// until it receives this, avoiding the race where 'init' arrives before the
// listener is registered (the bundle is large and takes time to parse).
// trustedOrigin is not yet known at this point (init has not arrived), so
// '*' is the only option for this bootstrap message. // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
window.parent?.postMessage({ type: 'sandboxLoaded' }, '*'); // nosemgrep: javascript.browser.security.wildcard-postmessage-configuration.wildcard-postmessage-configuration
