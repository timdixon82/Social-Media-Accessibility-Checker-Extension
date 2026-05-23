# Accessibility: Social Media Post Accessibility Checker

This page records the project's WCAG 2.2 AAA interpretation and the accessibility decisions made during the setup build.

## Compliance target

This project targets WCAG 2.2 Level AAA, matching the team's baseline for all projects. The relevant law is the UK Equality Act, the European Accessibility Act, and the Americans with Disabilities Act (ADA). See the global wiki for the full legal landscape.

## Contrast verdict threshold: AA to AAA transition (Q60A, 2026-05-23)

The extension reports both WCAG 2.2 AA and AAA results for every detected colour pair. The overall image PASS or FAIL verdict now uses WCAG 2.2 AAA thresholds:

- Normal text (bounding box height below 24 px): 7:1 contrast ratio required.
- Large text (bounding box height 24 px or above): 4.5:1 contrast ratio required.

Before this change (pre-setup-build), the verdict used WCAG 2.2 AA thresholds (4.5:1 normal / 3:1 large). The AA column is retained in the contrast table for reference.

This decision was authorised by Tim (Q60A, 2026-05-23) and is recorded at docs/decisions/001-aaa-verdict-threshold.md.

## Popup focus ring (setup build fix, 2026-05-23)

Before the setup build, the Run Audit button used `outline: 3px solid #0a66c2` as its focus-visible ring. When the button is enabled, its background is also `#0a66c2`, producing a 1:1 contrast ring that fails WCAG 2.2 SC 2.4.13 (Focus Appearance, AAA).

The fix changes the focus ring to `#ffffff` (white) in the enabled state. White on `#0a66c2` produces a contrast ratio of approximately 4.6:1, satisfying the AAA criterion.

This fix was recommended by Carol (baseline audit finding AAA-3) and authorised by Tim (Q60A included Carol's AAA-3 recommendation in the setup scope). See popup.html.

## "Coming soon" label contrast (extension-platform exception)

The popup shows X/Twitter, Facebook, and Instagram as "coming soon". The label text uses `color: #999` on a white background, which produces approximately 2.85:1 — below WCAG 2.2 AA (4.5:1).

The disabled-control exemption in WCAG 2.2 SC 1.4.3 does not apply to the "coming soon" label because the label is informational text, not a control state indicator. A formal exception is filed at docs/exceptions/coming-soon-label-contrast.md, pending Tim's decision (no Q-number yet). This is not blocking for the setup build.

## Popup fixed width exception

The popup is fixed at `width: 300px`. Chrome extension popups are platform-constrained. At very high zoom levels (above 400%), content may be cut off. This is an extension-platform constraint, not an authoring defect. The exception is filed at docs/exceptions/popup-fixed-width.md.

## Outstanding accessibility gaps (deferred)

The following gaps were identified in the Carol baseline audit and are deferred to the first dedicated accessibility sprint. They are not blocking for the setup build.

1. Manual screen reader testing on VoiceOver/Chrome, JAWS/Chrome, and NVDA/Firefox.
2. axe-core integration in CI via Playwright (extension pages require a running browser instance).
3. Focus management for the card list (finding A-3: focus jumps to each new card on append).
4. aria-live region audit with a real screen reader (findings AA-2).
5. Inline report page accessibility (landmark structure, skip link, focus start).
6. Touch target size verification for slider and radio buttons.
7. Duplicate `aria-labelledby` IDs across multiple post cards (finding A-2).
8. Unicode badge icon characters — replace with aria-hidden SVG (finding A-1).
9. "View full report" and "Expand" button accessible names (findings A-4, A-5).
