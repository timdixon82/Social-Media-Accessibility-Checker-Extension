# ADR-008: Platform scope and badge labelling

## Status

State: Accepted
Date: 2026-05-31
Superseded by: —

## Decision

The popup keeps the "coming soon" labels for X/Twitter, Facebook, and Instagram. Those platforms remain visible but disabled. They are not removed.

The user-facing overall-verdict badge is renamed from any generic platform label to "LinkedIn only" to make the scope of the audit unambiguous to users.

Multi-platform support remains a deliberate future decision, not an implicit extension of the current code.

## Rationale

Tim's decision Q59C (2026-05-31). Jacob's ADR-007 recommendation was to remove the dormant labels entirely. Tim chose to keep them as a placeholder and rename the badge instead. Keeping the "coming soon" labels communicates the intended roadmap to users without shipping an incomplete feature. The "LinkedIn only" badge makes the audit scope clear without requiring the user to read documentation.

The "coming soon" labels are informational text and are not exempt from contrast requirements (they are not disabled controls). The contrast of these labels must meet WCAG 2.2 AAA (7:1 for normal text). This is tracked as finding AA-1 in `docs/accessibility.md`.

## Source

Tim's decision Q59C, 2026-05-31; Jacob's architecture review, 2026-05-23; Carol's baseline audit, 2026-05-23.
