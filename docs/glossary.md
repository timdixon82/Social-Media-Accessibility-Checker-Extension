# Glossary: Social Media Post Accessibility Checker

Terms used in this project's code, documentation, and reports.

## AA

WCAG 2.2 Level AA. The minimum legal accessibility standard in the UK and EU. Contrast thresholds: 4.5:1 for normal text, 3:1 for large text. The extension shows AA results in the contrast table for reference but uses AAA for the overall verdict.

## AAA

WCAG 2.2 Level AAA. The highest WCAG conformance level and the team's compliance baseline. Contrast thresholds: 7:1 for normal text, 4.5:1 for large text. The extension's overall pass/fail verdict uses AAA thresholds.

## App page

The `src/app/app.html` page opened as a new tab when an audit starts. It has full DOM and timer rights and hosts the sandboxed OCR iframe. The audit results are rendered here.

## Bounding box

A rectangular region in a resized image, returned by the OCR model, enclosing a detected word. Used to sample pixel colours for contrast analysis.

## Content script

The `src/content/content_script.js` file injected into the active LinkedIn tab by the service worker. Scrolls the page, expands "see more" buttons, and extracts post data.

## Large text

A detected word whose bounding box height is 24 px or above in the canonical resized image space (800 px wide). Large text has lower contrast thresholds than normal text under WCAG 2.2.

## Manifest V3 (MV3)

The current Chrome extension architecture. The service worker (background script) replaces the persistent background page. MV3 imposes restrictions on `eval` and requires the sandbox iframe pattern for OCR.

## NO_TEXT verdict

The verdict returned by `analyseImage()` when OCR finds no usable text in an image. The image is not counted as a pass or fail for contrast purposes.

## OCR

Optical character recognition. SMACE uses PaddleOCR PP-OCRv4 running as ONNX models in a WebAssembly context inside the sandbox iframe.

## Popup

The `src/popup/popup.html` extension popup that appears when the user selects the extension icon. Provides the platform selector, post count slider, and Run Audit button.

## Sandbox iframe

A hidden `<iframe>` element loaded from `src/sandbox/sandbox.html`, which is listed in `manifest.json` under `sandbox.pages`. The sandbox page is exempt from the extension's Content Security Policy and can run `'unsafe-eval'` code, which is required by `onnxruntime-web`'s WASM threading proxy.

## Service worker

The `src/background/service_worker.js` Manifest V3 background script. Opens the app tab, injects the content script, fetches images, and routes messages between the popup, content script, and app page.

## SMACE

Social Media Post Accessibility Checker Extension. The project short name used in documentation and log entries.

## Verdict

The binary pass/fail result for an image's colour contrast. SMACE verdicts: PASS (all colour pairs pass WCAG 2.2 AAA), FAIL (at least one pair fails AAA), or NO_TEXT (no text detected by OCR).

## WCAG

Web Content Accessibility Guidelines. Published by the W3C. Version 2.2 is current. See the global wiki's accessibility.md for the full interpretation.
