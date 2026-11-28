# Brief: 013-a11y-sprint

## Summary

Fix the remaining open accessibility findings from Carol's 2026-05-23 baseline audit
(documented in `docs/accessibility.md`). Two findings are high severity; five are
moderate. Three low-severity items are deferred or documented as platform constraints.

- Status: done
- Branch: fix/a11y-sprint (merged to main 2026-06-05)
- Priority: 1
- Blockers: none

## Requirements

Fix all high and moderate findings from `docs/accessibility.md`, and assess the low
findings. Findings in priority order:

**High**
- AAA-3 (2.4.13 Focus Appearance): Run button focus ring near-invisible. Change to `#ffffff` or `#061528`.
- A-2 (1.3.1 Info and Relationships): Duplicate `aria-labelledby` targets on post cards. Suffix IDs with the card sequence counter.

**Moderate**
- A-1 (1.1.1 Non-text Content): Badge icons use Unicode symbols (✓ ✗ !) that screen readers announce inconsistently. Remove symbols; label text is sufficient.
- A-3 (2.1.1 Keyboard): New post cards pull keyboard focus away. Focus only the first card, or use a polite `aria-live` region.
- A-4 (4.1.2 Name, Role, Value): "View full report" buttons share identical accessible names. Add `aria-label` including author and date.
- A-5 (4.1.2 Name, Role, Value): "Expand/Collapse" buttons share identical accessible names. Add `aria-label` including author and date.
- AAA-1 (1.4.6 Contrast Enhanced): `.url-display` uses `#555` on `#f4f4f4` (≈ 4.6:1), fails AAA 7:1 threshold. Raise to AAA.

**Low (to assess)**
- A-6 (1.3.1 Info and Relationships): Inline report page has no landmark structure. Add `<main>`, `<nav>`, `<header>`.
- AA-2 (4.1.3 Status Messages): Two simultaneous `aria-live` regions update with duplicate content. Deduplicate.
- AA-3 (1.4.10 Reflow): Popup fixed at 300px. If this is a hard extension-platform constraint, document as an exception in `docs/exceptions/`.

## Routing plan

1. Sean implements all high and moderate fixes on branch `fix/a11y-sprint`. Assesses AA-3 and documents as exception if confirmed platform constraint. Implements A-6 and AA-2 (low) while touching those files.
2. Carol runs functional, accessibility (axe-core, Pa11y, WCAG 2.2 AAA code review), and visual passes in parallel. Flags rework to Sonja if any finding regresses.
3. Sonja runs the architecture-and-security conformance check, reviews, and presents to Tim.
4. Tim approves; Sonja merges.

## Out of scope

- Any change to the extension's core audit logic or scanning algorithm.
- Chrome Web Store submission or distribution changes.
- Manual screen-reader testing (deferred; see `docs/accessibility.md` deferred items).
- Touch or pointer target size verification (deferred).

## Risk and rollback

Risk: A change to `aria-labelledby` IDs or focus management could break the existing Playwright accessibility test suite.

Rollback: work runs on `fix/a11y-sprint` only; main is untouched until Tim's express approval. If merged work causes a regression, revert the merge commit.

## Definition of done

- [ ] AAA-3 fixed: Run button focus ring passes 2.4.13.
- [ ] A-2 fixed: all `aria-labelledby` IDs are unique per card.
- [ ] A-1 fixed: badge icons have no stray Unicode symbols in accessible names.
- [ ] A-3 fixed: focus management on new cards uses first-card-only or `aria-live`.
- [ ] A-4 fixed: "View full report" buttons have unique `aria-label` values.
- [ ] A-5 fixed: "Expand/Collapse" buttons have unique `aria-label` values.
- [ ] AAA-1 fixed: `.url-display` contrast passes 7:1.
- [ ] A-6 fixed: report page has landmark structure.
- [ ] AA-2 fixed: `aria-live` region deduplicated.
- [ ] AA-3 assessed: documented as exception if platform constraint, or fixed.
- [ ] All existing Playwright tests pass.
- [ ] Carol's test pass complete.
- [ ] `docs/accessibility.md` updated: all fixed findings marked Resolved.

## Approved GitHub actions

All six pre-approved by Tim (Q-SMACE2ABCDEF, 2026-06-05).

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [x] Comment on a pull request or an issue
- [x] Create an issue
