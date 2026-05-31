# Pattern: On-Device OCR with PaddleOCR and ONNX Runtime Web

## Status

State: Accepted
Date: 2026-05-31
Superseded by: —

## Summary

SMACE runs PP-OCRv5 optical character recognition entirely on the user's device using ONNX Runtime Web and WebAssembly, with no data sent to any server. This pattern records the integration approach for reuse in future projects.

## Components

- `@gutenye/ocr-browser`: a browser-ready wrapper around the PaddleOCR detection and recognition models.
- `onnxruntime-web`: the ONNX Runtime compiled to WebAssembly. Provides the inference engine.
- `src/sandbox/sandbox.js`: the Chrome sandboxed page that initialises and runs the OCR model.
- `src/adapters/paddle-ocr.js`: the adapter that loads the model and exposes a `recognise(imageData)` function.

## Why a sandboxed page is required

`onnxruntime-web`'s multi-threaded backend uses a SharedArrayBuffer and a WASM threading proxy that requires `wasm-unsafe-eval` in the Content Security Policy. Chrome MV3 extension pages cannot allow `wasm-unsafe-eval`. The sandboxed page is the only extension context that can set this permission, because it gets its own isolated CSP.

See [ADR-003](../decisions/003-three-context-data-flow.md) and the [MV3 Execution Contexts](mv3-execution-contexts.md) pattern.

## Initialisation handshake

1. The app page (`app.js`) creates a hidden `<iframe>` pointing to `sandbox.html` and stores a reference to `ocrFrame.contentWindow`.
2. On load, the sandbox page sends a `{ type: 'ready' }` message to `window.parent`.
3. The app page listens for this message and resolves its `ocrReady` promise.
4. Before processing any image, the app page awaits `ocrReady`.
5. If `ocrReady` does not resolve within 120 seconds, the report page shows a clear error (acceptance criterion AC-FR-9).

## Sending an image for OCR

1. The app page resizes the image to a canonical width (to keep inference time predictable).
2. It calls `ocrFrame.contentWindow.postMessage({ type: 'ocr', imageData: dataUrl }, extensionOrigin)`.
3. The sandbox runs the model and posts back `{ type: 'ocrResult', detections: [...] }`.
4. The app page listens for `ocrResult` on `window` and routes it by a sequence ID embedded in the message.

## Word filtering

Raw OCR output is noisy. SMACE discards detections that meet any of these conditions:

- Word is shorter than two characters.
- Word has fewer than two alphanumeric characters.
- Confidence is below 50% for words of 2 to 5 alphanumeric characters.
- Confidence is below 25% for words of 6 or more alphanumeric characters.
- Bounding box is smaller than 4 by 4 pixels.

Only the retained detections are passed to the contrast analysis pipeline.

## Model files

The ONNX model files and WASM binaries are bundled with the extension at build time using webpack's `CopyPlugin`. They are copied from `node_modules/@gutenye/ocr-browser/` into `dist/vendor/`. They are loaded from `dist/vendor/` at runtime, not fetched from a CDN. After the initial `npm install`, no further network calls are made for the models.

## Supply chain

The ONNX model package is pinned to an exact version (no `^` range). Any version update goes through a pull request and a full local build and smoke test. See [ADR-007](../decisions/007-pinned-exact-dependency-versions.md).

## Cross-cutting note

This pattern is a candidate for the global wiki at `docs/patterns/on-device-ocr.md` if a future project (image alt-text checker, document scanner, accessibility tool) uses the same stack. Sonja will promote it at that time.
