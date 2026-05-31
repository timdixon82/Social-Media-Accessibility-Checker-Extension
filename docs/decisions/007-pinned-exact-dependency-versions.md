# ADR-007: Pin all third-party libraries to exact versions

## Status

State: Active

## Decision

The five runtime dependencies (`@gutenye/ocr-browser`, `jszip`, `marked`, `onnxruntime-web`, `pdfmake`) are pinned to exact versions in `package.json` (no `^` or `>=` ranges). Dependabot opens grouped minor and patch updates weekly, and major updates as individual pull requests.

## Rationale

This is the Browser AI Application stack rule and the single most important supply-chain defence on a project that loads WASM at runtime. Unpinned ranges mean a `npm ci` on any given day could silently install a different WASM binary without a code review.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
