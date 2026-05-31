# ADR-009: Overall contrast verdict threshold raised to WCAG 2.2 AAA

## Status

State: Accepted
Date: 2026-05-31
Superseded by: —

## Decision

The overall post verdict for contrast (FR-11) uses WCAG 2.2 AAA as the pass/fail threshold, not WCAG 2.2 AA.

For normal text, a colour pair must meet 7:1 contrast to pass. For large text (bounding box height of 24 pixels or more), a colour pair must meet 4.5:1 to pass.

A post receives an overall FAIL if any image contains at least one colour pair that fails the AAA threshold.

The extension still reports AA results in the expandable contrast detail table for reference, so users can see both AA and AAA results side by side.

## Rationale

Tim's decision Q60A (2026-05-31). The team's compliance baseline is WCAG 2.2 AAA throughout. The initial implementation used AA as the verdict threshold, which was inconsistent with the team's standard. Raising the tool's own bar to AAA means the extension is honest about what "accessible" means in the context of the team's work.

## Consequences

The code change required is in `src/core/analyse.js` (or wherever the per-image verdict is computed): change the condition that sets FAIL from `ratio < 4.5` (normal) or `ratio < 3` (large) to `ratio < 7` (normal) or `ratio < 4.5` (large).

The acceptance criteria for FR-11 must be updated to reflect AAA thresholds. The updated criteria are:

- An image with all colour pairs passing WCAG 2.2 AAA receives a PASS verdict.
- An image with at least one colour pair failing AAA receives a FAIL verdict and the failing pair details are shown.
- An image where OCR finds no usable text receives a NO_TEXT verdict.

## Source

Tim's decision Q60A, 2026-05-31; Tad's requirements review, 2026-05-23.
