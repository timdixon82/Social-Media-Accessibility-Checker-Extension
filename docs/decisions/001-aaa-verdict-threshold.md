# Decision 001: Use WCAG 2.2 AAA as the overall contrast verdict threshold

## Status

Accepted. Decided by Tim (Q60A, 2026-05-23).

## Context

The extension reports both WCAG 2.2 AA and WCAG 2.2 AAA contrast results for every detected colour pair. Before the setup build, the binary PASS or FAIL verdict for an image used AA thresholds: 4.5:1 for normal text and 3:1 for large text (bounding box height 24 px or above in the canonical resized image).

The team's compliance baseline for all projects is WCAG 2.2 AAA. Tad's requirements (AC-FR-11) recorded both AA and AAA results, but the question of which should drive the overall verdict was open. Sonja surfaced this as Q60, and Tim answered Q60A.

## Decision

The overall image contrast verdict uses WCAG 2.2 AAA thresholds:

- Normal text: 7:1 contrast ratio required.
- Large text (bounding box height 24 px or above): 4.5:1 required.

An image receives a FAIL verdict if any detected colour pair falls below the AAA threshold for its text size. An image with no detected text receives the NO_TEXT verdict.

The AA column is retained in the contrast table for reference. It is not removed because it provides useful information to content creators who are working towards AAA but not yet there.

## Consequences

- `src/core/analyse.js`: `analyseImage()` filters failures with `!p.passAaa` and names AAA in the detail string.
- `src/app/app.js`: failing-regions filter updated to `!pair.passAaa` in both the live card view and the inline report page.
- `src/export/pdf.js`: failing-regions filter updated to `!p.passAaa`.
- `src/export/strings.js`: THRESHOLDS_FOOTER updated to name AAA as the verdict standard.
- The AA column in the contrast table continues to display for reference.

## Alternatives considered

- Keep AA as the verdict threshold and document AAA as informational only. Rejected: the team's baseline is AAA, and the extension is a WCAG tool — it should enforce the level it claims to target.
- Remove the AA column entirely. Not chosen: AA data is useful context for content creators.
