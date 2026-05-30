# Project Accessibility: Social Media Accessibility Checker Extension (SMACE)

This project meets WCAG 2.2 at AAA, interpreted in the global wiki's `accessibility.md`.

This page summarises the baseline accessibility audit carried out by Carol on 2026-05-23. The full audit is in `.claude/work/012-smace-setup/carol-baseline-audit.md`.

## Surfaces audited

| File | Role |
|---|---|
| `src/popup/popup.html` | Extension popup — platform selector, range control, Run Audit button |
| `src/app/app.html` | Report tab — audit results, progress bar, theme toggle, export actions |
| `src/offscreen/offscreen.html` | Internal Chrome offscreen document — no user-facing UI |
| `src/sandbox/sandbox.html` | Chrome sandboxed page for OCR — no user-facing UI |

## Known findings (open)

The following findings are from Carol's 2026-05-23 code-inspection baseline. They are not exceptions; they are open defects to be fixed in the accessibility sprint.

| ID | Criterion | Severity | Summary |
|---|---|---|---|
| A-1 | 1.1.1 Non-text Content | Moderate | Badge icons use Unicode symbols (✓ ✗ !) that screen readers announce inconsistently. Remove the symbols; the label text is sufficient. |
| A-2 | 1.3.1 Info and Relationships | High | Duplicate `aria-labelledby` targets across dynamically generated post cards. Suffix each ID with the card sequence counter. |
| A-3 | 2.1.1 Keyboard | Moderate | New post cards receive programmatic focus on append, pulling keyboard users away. Only focus the first card, or use a polite `aria-live` region. |
| A-4 | 4.1.2 Name, Role, Value | Moderate | "View full report" buttons share identical accessible names. Add `aria-label` including author and date. |
| A-5 | 4.1.2 Name, Role, Value | Moderate | "Expand/Collapse" buttons share identical accessible names. Add `aria-label` including author and date. |
| A-6 | 1.3.1 Info and Relationships | Low | Inline report page has no landmark structure (no `<main>`, `<nav>`, `<header>`). |
| AA-1 | 1.4.3 / 1.4.6 Contrast | Moderate | Popup `.coming-soon` text uses `#999` on `#fff` (≈ 2.85:1). Fails AA and AAA. |
| AA-2 | 4.1.3 Status Messages | Low | Two simultaneous `aria-live` regions update with duplicate content during audits. |
| AA-3 | 1.4.10 Reflow | Low | Popup fixed at `300px` width. Content cut off at 400% zoom. Document as extension-platform constraint. |
| AAA-1 | 1.4.6 Contrast Enhanced | Moderate | `.url-display` uses `#555` on `#f4f4f4` (≈ 4.6:1), fails AAA 7:1 threshold for 11 px text. |
| AAA-3 | 2.4.13 Focus Appearance | High | Run button focus ring uses same colour as button background — near-invisible in enabled state. Change to `#ffffff` or `#061528`. |

## Exceptions

Documented accessibility exceptions are in `exceptions/`. None recorded yet.

## Deferred items

The following items are real but not blocking for the current build. They are tracked for the accessibility sprint.

1. Manual screen reader testing on VoiceOver/Safari, JAWS/Chrome, and NVDA/Firefox.
2. Keyboard focus management for the card list (coherent "Jump to results" link).
3. Live-region audit with a real screen reader.
4. Inline report page full accessibility audit (landmark structure, skip link, focus start point).
5. Touch and pointer target size verification on a real device.
