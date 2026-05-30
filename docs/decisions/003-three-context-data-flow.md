# ADR-003: Audit-time data flow runs through three contexts

## Status

State: Active

## Decision

The audit data flow is fixed: popup → service worker → content script (scrape) → service worker (image fetch) → app page (CSP-fenced surface) → sandbox iframe (OCR) → app page (WCAG, render, export).

## Rationale

This three-context split is forced by three MV3 constraints: the service worker has no DOM or canvas, the offscreen page lacks cross-origin isolation for SharedArrayBuffer, and the extension-pages CSP forbids `'unsafe-eval'` that `onnxruntime-web`'s threading proxy relies on. The sandbox iframe is the only context where the OCR runtime can initialise. Documenting this prevents a future contributor from "simplifying" the architecture into a broken state.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
