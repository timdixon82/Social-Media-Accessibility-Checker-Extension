# ADR-006: Treat the project as a single-platform LinkedIn auditor

## Status

State: Active

## Decision

The popup presents a single LinkedIn option. All selectors stay LinkedIn-specific. Host permissions stay scoped to LinkedIn. The `platformLabel` enum in `popup.js` is reduced to LinkedIn-only. Multi-platform support is a deliberate future Architecture Decision Record, not an implicit extension.

## Rationale

Every line of code is LinkedIn-shaped. The existing "Social Media" name is honest about intent, but pretending multi-platform support exists produces dead UI, false advertising, and review confusion. The dormant platform labels are removed.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
