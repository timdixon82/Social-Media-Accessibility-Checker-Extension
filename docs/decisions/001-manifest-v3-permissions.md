# ADR-001: Adopt Manifest V3 with the activeTab, scripting, and storage triad

## Status

State: Active

## Decision

The extension uses Manifest V3. Permissions are `activeTab`, `scripting`, and `storage`. Host permissions are scoped to `https://www.linkedin.com/*`, `https://media.licdn.com/*`, and `https://dms.licdn.com/*`. We do not request `tabs`, `cookies`, or broad host permissions.

## Rationale

Chrome Web Store reviews favour the smallest viable permission set. MV3 is the only path forward for new submissions. The audit needs no persistent background page.

## Source

Jacob's architecture review, 2026-05-23 (`.claude/work/012-smace-setup/jacob-architecture-review.md`).
