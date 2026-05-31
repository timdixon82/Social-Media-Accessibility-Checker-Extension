# Pattern: MV3 Execution Contexts

## Status

State: Accepted
Date: 2026-05-31
Superseded by: —

## Summary

Chrome Manifest V3 (MV3) has four execution contexts. Each has hard constraints on what it can do. This pattern records the decision tree for choosing the right context, and the specific constraints that drove the SMACE architecture.

## The four contexts

### Service worker

The extension's background runtime. Wakes on events, sleeps when idle.

- No DOM and no canvas access.
- No SharedArrayBuffer.
- Has full `chrome.*` API access.
- Can make `fetch()` calls using host permissions.
- Cannot run ONNX Runtime Web (needs DOM and WASM threading).

Use the service worker for: message routing, image fetching using host permissions, opening tabs, managing the audit lifecycle.

### Content script

Injected into a web page tab.

- Has access to the page's DOM.
- Has access to canvas (to read image pixel data from the page, if needed).
- No SharedArrayBuffer.
- Has a restricted subset of `chrome.*` APIs (`chrome.runtime.sendMessage`, `chrome.storage`).
- Runs in an isolated JavaScript world, not the page's own JavaScript context.

Use the content script for: scraping post data from the LinkedIn DOM, scrolling the feed, clicking "see more" buttons.

### Extension page

An HTML page opened by the extension (for example, `app.html`).

- Full DOM and canvas access.
- No SharedArrayBuffer (cross-origin isolation headers cannot be set on extension pages).
- Full `chrome.*` API access.
- CSP forbids `'unsafe-eval'` and external origins.

Use an extension page for: rendering the report UI, running the WCAG contrast pipeline (`src/core/`), generating exports.

### Sandboxed page

An HTML page listed under `"sandbox"` in `manifest.json`.

- Full DOM and canvas access.
- SharedArrayBuffer is available (the sandbox gets cross-origin isolation).
- No `chrome.*` APIs at all.
- Can use `wasm-unsafe-eval` in its CSP.
- The only context where ONNX Runtime Web can initialise.

Use the sandboxed page for: running the OCR model (PP-OCRv5 via ONNX Runtime Web and WebAssembly).

## SMACE data flow

```
Popup
  → service worker (startAudit message)
    → content script (scrape LinkedIn DOM)
    → service worker (image fetch via host permissions)
      → app page (WCAG contrast, rendering, export)
        → sandbox iframe (OCR via ONNX Runtime Web)
        ← sandbox iframe (word detections + bounding boxes)
      ← app page (contrast results, post cards)
```

The sandbox iframe is embedded in `app.html` as a hidden `<iframe>`. Communication is via `postMessage`. See [ADR-003](../decisions/003-three-context-data-flow.md) for the rationale.

## Common mistakes to avoid

- Do not try to run ONNX Runtime Web in the service worker. It has no DOM; WASM initialisation will fail.
- Do not try to run ONNX Runtime Web in the app page (extension page). The CSP forbids `'unsafe-eval'`, and SharedArrayBuffer is unavailable, so the threading proxy will fail.
- Do not use the offscreen page as a substitute for the sandbox. The offscreen page is an extension page and has the same CSP and SharedArrayBuffer constraints. See [ADR-004](../decisions/004-retire-offscreen-page.md).
- Do not use `'*'` as the target origin in `postMessage` calls to the sandbox. Always specify the exact `chrome-extension://` origin.

## Cross-cutting note

This pattern is a candidate for the global wiki at `docs/patterns/mv3-execution-contexts.md` if a second browser-extension project starts. Sonja will promote it at that time.
