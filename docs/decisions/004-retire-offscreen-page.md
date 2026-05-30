# ADR-004: Retire the offscreen page; sandbox iframe is the OCR home

## Status

State: Active

## Decision

The `chrome.offscreen` page is removed from `manifest.json`, `webpack.config.js`, and `src/`. The sandbox page (`src/sandbox/sandbox.js` plus `src/adapters/paddle-ocr.js`) is the only OCR runtime. The `offscreen/` source directory is deleted.

## Rationale

The service worker's comment block confirms the offscreen page was abandoned because it cannot grant SharedArrayBuffer access. Two parallel scaffolds for the same job is the worst of both worlds. The dead bundle inflates the extension package and confuses reviewers.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
