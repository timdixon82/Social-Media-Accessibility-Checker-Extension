# Project Coding Standards: Social Media Accessibility Checker Extension (SMACE)

This project follows the team's stack-independent standards in the global wiki's `coding-standards.md`, and the per-stack standards in the global wiki's `stacks/browser-ai-application.md`.

This page records only what is specific to SMACE: its stack, and any project-specific coding decisions.

## Stack

Chrome Manifest V3 browser extension. JavaScript (ES modules), webpack 5 in production mode, ONNX Runtime Web (WebAssembly backend), PP-OCRv5 OCR model.

Build entry points: `background/service_worker`, `popup/popup`, `app/app`, `offscreen/offscreen`, `sandbox/sandbox`, `content/content_script`.

## Project-specific notes

- All OCR and contrast processing runs on-device. No data is sent to any external server.
- The `sandbox/sandbox.html` page is the only context that requires `wasm-unsafe-eval`; it is isolated in a sandboxed page per MV3 best practice.
- `src/core/` is pure data-in / data-out, with no Chrome API dependencies. All Chrome-specific code lives in the background service worker, content script, and popup.
- No paid third-party CI tokens. All CI scanning uses free, self-contained tooling: `semgrep scan --config p/default --error` (never `semgrep ci`).
- Dependency versions use `^` ranges in `package.json`. Dependabot tracks updates weekly.
