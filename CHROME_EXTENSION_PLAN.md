# Plan: Chrome Extension with PaddleOCR (ppu-paddle-ocr)

## Context

Turn the LinkedIn accessibility auditor into a Chrome extension that runs entirely on the user's machine — no server. The user visits LinkedIn normally (already authenticated), clicks the extension, and the audit runs client-side: scraping via content script, OCR via PaddleOCR ONNX models running in WebAssembly/WebGPU, WCAG analysis in JS.

**Key discovery:** `ppu-paddle-ocr` (npm v3.6.0, updated May 2026) is a purpose-built browser-extension-compatible wrapper around PP-OCRv5 mobile models via ONNX Runtime Web. It includes the full pipeline (DB detection post-processing + CTC recognition decoding) with no server or Python required. Auto-upgrades to WebGPU on Chrome for 2–5× speed.

---

## Why This Works (vs. a Plain Website)

A hosted web page cannot scrape LinkedIn — CORS and SameSite cookies block cross-origin requests. A Chrome extension with `host_permissions` bypasses CORS for permitted origins, using the user's existing authenticated session. The extension IS a web app (HTML/CSS/JS) — it just runs with elevated browser permissions.

---

## Architecture

```
chrome-extension/
  manifest.json              MV3 — declares permissions, background, content script
  background/
    service_worker.js        Image fetching (CORS bypass), ppu-paddle-ocr worker init,
                             message routing between content ↔ offscreen ↔ app
  offscreen/
    offscreen.html           Hidden document — canvas access for pixel analysis
    offscreen.js             ppu-paddle-ocr OCR runs here (needs DOM/canvas);
                             receives image ArrayBuffers, returns text + bboxes
  content/
    content_script.js        Runs on linkedin.com — DOM scraping, scrolling, post extraction
  app/
    app.html                 Full-page report viewer (opens in new tab)
    app.js                   Renders reports, receives results via chrome.runtime messages
  popup/
    popup.html               Small toolbar popup — form + Run button
    popup.js                 Sends startAudit message to service worker
  lib/
    wcag.js                  JS port of analyse_contrast.py WCAG math + k-means
  vendor/                    Bundled: ppu-paddle-ocr + onnxruntime-web WASM
```

**Why offscreen document:** Chrome MV3 service workers have no DOM/canvas access. The `chrome.offscreen` API provides a hidden document that can use canvas APIs — needed for `getImageData()` in pixel-level contrast analysis and for the ONNX runtime that ppu-paddle-ocr uses internally.

**Message flow:**
```
popup.js  ──startAudit──►  service_worker.js
                                │  ──injectContentScript──►  content_script.js
                                │                                   │
                                │◄──── postData[] (text, author, imageUrls) ─────┘
                                │
                                ├─ fetch(imageUrl)  [CORS bypassed via host_permissions]
                                │
                                ├──imageArrayBuffer──►  offscreen.js
                                │                          │  ppu-paddle-ocr.recognize()
                                │                          │  wcag.js contrast analysis
                                │◄──── findings[] ─────────┘
                                │
                                └──progress + results──►  app.html (new tab)
```

---

## Files to Create

### `manifest.json`
```json
{
  "manifest_version": 3,
  "name": "LinkedIn Accessibility Auditor",
  "version": "1.0.0",
  "permissions": ["activeTab", "scripting", "storage", "offscreen"],
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://media.licdn.com/*",
    "https://dms.licdn.com/*"
  ],
  "background": { "service_worker": "background/service_worker.js" },
  "action": { "default_popup": "popup/popup.html" },
  "content_scripts": [{
    "matches": ["https://www.linkedin.com/*"],
    "js": ["content/content_script.js"],
    "run_at": "document_idle"
  }]
}
```

### `content/content_script.js` (~200 lines)
Port of `linkedin_audit.js` DOM extraction logic — reuse the same proven selectors:
- Post container: `div.feed-shared-update-v2`
- Author: `.update-components-actor__name`
- Date: `.update-components-actor__sub-description` → split on `•`
- Post URL: `data-urn` → `https://www.linkedin.com/feed/update/${urn}/`
- Expand "see more" buttons before extracting text
- Images: `img[src*="media.licdn.com"]` filtered to only post-content images (height > 100px, exclude reactions/avatars)
- Alt text: `img.alt` attribute
- Emoji scan: same regex as existing tool
- Non-standard Unicode font detection: same character range scan
- Scrolling: `window.scrollBy(0, 800)` loop with post count polling

Returns array of post objects via `chrome.runtime.sendMessage`.

### `background/service_worker.js` (~150 lines)
- Receives `startAudit` message from popup with `{ url, posts, days }`
- Opens `app.html` in a new tab (sends progress there via `chrome.tabs.sendMessage`)
- Creates offscreen document (`chrome.offscreen.createDocument`)
- Injects and calls content script on the active LinkedIn tab
- For each post: fetches image URLs as `ArrayBuffer` using `fetch()` (service worker has CORS bypass)
- Sends `ArrayBuffer` to offscreen doc for analysis
- Receives findings, forwards to app tab as progress events

### `offscreen/offscreen.js` (~100 lines)
- Receives `{ imageBuffer }` message
- Creates `Blob` → `ImageBitmap` → draws to `OffscreenCanvas`
- Calls `ppu-paddle-ocr`: `await recognize(canvas)` → returns `{ words: [{ text, conf, bbox }] }`
- For each word bounding box: calls `worstStripContrast()` from `wcag.js`
- Applies confidence thresholds (≥25 for ≥6 alnum chars, ≥50 for 2–5)
- Returns findings via `chrome.runtime.sendMessage`

### `lib/wcag.js` (~120 lines)
Direct JS port of `analyse_contrast.py` — identical algorithms, Canvas API instead of NumPy:
- `linearise(v)`, `luminanceFromRgb(r,g,b)`, `wcagContrast(l1,l2)`, `hexToRgb(h)`, `rgbToHex(r,g,b)`, `colourDistance(h1,h2)`
- `kmeans2(values)` — same 1-D k-means, JS typed arrays
- `getPixelRegion(ctx, x, y, w, h)` — canvas `getImageData()` slice
- `regionContrast(ctx, x, y, w, h)` — k-means on luminance, text = minority cluster
- `worstStripContrast(ctx, x, y, w, h)` — same strip logic (75% height, ≥3 strips)
- `buildColourPairs(findings, threshold=25)` — same merge + sort

### `popup/popup.html` + `popup.js` (~80 lines total)
Small toolbar popup:
- LinkedIn URL field (pre-filled from `chrome.tabs.query` active tab URL)
- Slider: number of posts (default 10)
- "Run Audit" button → sends `startAudit` to service worker → opens app tab
- "Open Last Report" button (stored in `chrome.storage.local`)

### `app/app.html` + `app.js` (~200 lines total)
Full-page report viewer opened by service worker:
- Receives progress via `chrome.runtime.onMessage`
- Renders each post's report as it completes (streaming, not wait-for-all)
- Markdown rendered to HTML using `marked.js` (CDN or bundled)
- Inline swatches rendered on `<canvas>` elements
- Summary table with pass/fail badges
- "Download all reports" → exports ZIP of `.md` files via `JSZip`
- Stores last results in `chrome.storage.local`

---

## OCR: ppu-paddle-ocr Integration

```javascript
// offscreen.js
import { recognize } from 'ppu-paddle-ocr/browser';

const results = await recognize(canvas, {
  models: 'mobile',  // PP-OCRv5 mobile det + rec
  language: 'en',
});
// results.words: [{ text, score, bbox: { x, y, w, h } }]
```

- Models downloaded on first use (~92 MB total: 84 MB det + 7.5 MB rec) and cached in IndexedDB by the library
- All subsequent runs are fully offline
- WebGPU auto-enabled on Chrome (2–5× faster than WASM)
- Character confidence maps directly to existing threshold logic (score 0–1, multiply by 100 for conf int)

---

## Build Setup

```
package.json  (extension root)
  "scripts": {
    "build": "webpack --config webpack.config.js",
    "watch": "webpack --watch"
  }
  "devDependencies": { "webpack": "...", "webpack-cli": "..." }
  "dependencies": {
    "ppu-paddle-ocr": "^3.6.0",
    "onnxruntime-web": "^1.21.0",
    "marked": "^12.0.0",
    "jszip": "^3.10.0"
  }
```

Webpack bundles `offscreen.js` + `wcag.js` + ppu-paddle-ocr into `dist/offscreen.bundle.js`. The ONNX runtime WASM files must be copied to `dist/` as static assets (onnxruntime-web requirement).

---

## Distribution

**Development / internal use:**
1. Run `npm install && npm run build`
2. In Chrome: `chrome://extensions` → enable Developer Mode → "Load unpacked" → select `dist/`
3. Navigate to a LinkedIn company posts page
4. Click extension icon → set posts count → Run

**Wider distribution:** Submit to Chrome Web Store ($5 one-time fee, 2–3 day review). Users install with one click.

---

## Verification

1. Load extension unpacked in Chrome Developer Mode
2. Log into LinkedIn in the same Chrome profile
3. Navigate to `https://www.linkedin.com/company/intertek/posts/`
4. Click extension icon → 3 posts → Run
5. Verify app tab opens and shows streaming progress
6. Verify report includes author, date, post text, images, contrast table
7. Check that near-1:1 contrast failures are detected (equivalent to `intertek_2026-05-15_4`)
8. Check that gradient strip detection works on photographic image text
9. First-run: verify models download (~92 MB) and cache; second-run is instant

---

## What's Unchanged (Conceptually)

All WCAG math, k-means clustering, strip scanning, colour pair merging — these are direct JS ports of the Python code. The algorithms and thresholds are identical. The `ppu-paddle-ocr` output (`words[].text`, `words[].score`, `words[].bbox`) maps cleanly to the existing detection dict format. No logic changes, only language translation (Python → JS).

## Reference: Existing Server-Side Files

The following existing files are the source of truth for logic that needs porting:

| Existing file | Ports to |
|---|---|
| `analyse_contrast.py` lines 35–65 | `lib/wcag.js` (colour math) |
| `analyse_contrast.py` lines 138–155 | `lib/wcag.js` (`kmeans2`) |
| `analyse_contrast.py` lines 162–224 | `lib/wcag.js` (`regionContrast`, `worstStripContrast`) |
| `analyse_contrast.py` lines 264–294 | `lib/wcag.js` (`buildColourPairs`) |
| `analyse_contrast.py` lines 91–131 | `offscreen/offscreen.js` (OCR → `ppu-paddle-ocr`) |
| `linkedin_audit.js` `extractPostData()` | `content/content_script.js` |
| `linkedin_audit.js` `parseRelativeTime()` | `content/content_script.js` |
| `linkedin_audit.js` `getDateKey()` | `content/content_script.js` |
| `linkedin_audit.js` `main()` scroll loop | `content/content_script.js` |
| `linkedin_audit.js` `analyse()` report builder | `app/app.js` |

## Existing Files Not Needed in Extension

- `analyse_contrast.py` — replaced by `lib/wcag.js` + `offscreen/offscreen.js`
- `linkedin_audit.js` — replaced by `content/content_script.js` + `background/service_worker.js`
- `open_linkedin.js` — not needed; extension uses user's existing Chrome session
- `Dockerfile` — not needed for extension distribution
- `firefox_profile/` — not needed; extension uses the browser's existing LinkedIn session
