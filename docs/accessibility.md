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
| A-1 | 1.1.1 Non-text Content | Moderate | Resolved — Badge icon symbols (✓ ✗ !) wrapped in `aria-hidden` span; label text forms the accessible name. Fixed in `fix/a11y-sprint` (2026-06-05). |
| A-2 | 1.3.1 Info and Relationships | High | Resolved — Section heading IDs in card details suffixed with card sequence counter (e.g., `alt-heading-1`). Fixed in `fix/a11y-sprint` (2026-06-05). |
| A-3 | 2.1.1 Keyboard | Moderate | Resolved — Programmatic focus on card append restricted to first card only; subsequent cards announced via existing polite `aria-live` on `#status-bar`. Fixed in `fix/a11y-sprint` (2026-06-05). |
| A-4 | 4.1.2 Name, Role, Value | Moderate | Resolved — "View full report" buttons have `aria-label="View full report for [author], [date]"`. Fixed in `fix/a11y-sprint` (2026-06-05). |
| A-5 | 4.1.2 Name, Role, Value | Moderate | Resolved — Expand/Collapse buttons have `aria-label` including author and date; label updates on toggle. Fixed in `fix/a11y-sprint` (2026-06-05). |
| A-6 | 1.3.1 Info and Relationships | Low | Resolved — `app.html` already has `<main id="main-content">`, `<header role="banner">`, and `<footer role="contentinfo">`. No code change required. Confirmed in `fix/a11y-sprint` (2026-06-05). |
| AA-1 | 1.4.3 / 1.4.6 Contrast | Resolved | Popup `.coming-soon` text raised to `#595959` on `#fff` (7.0:1). Passes WCAG 2.2 AAA. Fixed in `fix/badge-and-contrast`. |
| S-09 | 2.4.1 / 1.3.6 Landmarks | Resolved | Popup had no `<main>` landmark; screen readers could not navigate directly to primary content. Wrapped popup body in `<main>`. Fixed in `fix/popup-a11y-gaps`. |
| S-11 | 1.4.11 Non-text Contrast | Resolved | Fieldset border was `#ccc` on `#fff` (1.6:1, failed SC 1.4.11 3:1 threshold). Raised to `#767676` on `#fff` (4.54:1). Fixed in `fix/popup-a11y-gaps`. |
| AA-2 | 4.1.3 Status Messages | Low | Resolved — `aria-live` removed from `#progress-wrap`; status updates handled exclusively by `#status-bar`. `<progress>` linked to its label via `aria-labelledby`. Fixed in `fix/a11y-sprint` (2026-06-05). |
| AA-3 | 1.4.10 Reflow | Low | Documented as platform constraint — Chrome extension popup container prevents reflow at 400% zoom. Exception at `docs/exceptions/AA-3-popup-reflow.md`. Recorded in `fix/a11y-sprint` (2026-06-05). |
| AAA-1 | 1.4.6 Contrast Enhanced | Moderate | Resolved — `.url-display` darkened from `#555` to `#3d3d3d` on `#f4f4f4` (9.17:1, passes AAA 7:1). Fixed in `fix/a11y-sprint` (2026-06-05). |
| AAA-3 | 2.4.13 Focus Appearance | High | Resolved — Run button focus ring uses double-ring: `outline: 3px solid #061528` (navy, visible on white page) with `box-shadow: 0 0 0 5px #ffffff` (white ring visible on navy button). Fixed in `fix/a11y-sprint` (2026-06-05). |

## Exceptions

Documented accessibility exceptions are in `exceptions/`.

| File | Finding | Criterion | Date |
|---|---|---|---|
| `exceptions/popup-fixed-width.md` | Popup fixed width at high zoom | SC 1.4.10 Reflow (AA) | 2026-05-23 |
| `exceptions/AA-3-popup-reflow.md` | AA-3 popup fixed width at 400% zoom | SC 1.4.10 Reflow (AA) | 2026-06-05 |

## Deferred items

The following items are real but not blocking for the current build. They are tracked for the accessibility sprint.

1. Manual screen reader testing on VoiceOver/Safari, JAWS/Chrome, and NVDA/Firefox.
2. Keyboard focus management for the card list (coherent "Jump to results" link).
3. Live-region audit with a real screen reader.
4. Inline report page full accessibility audit (landmark structure, skip link, focus start point).
5. Touch and pointer target size verification on a real device.
