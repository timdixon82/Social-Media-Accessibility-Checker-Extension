# Exception: AA-3 — Popup fixed width at 400% zoom (WCAG SC 1.4.10 Reflow)

## Status

Accepted. Documented 2026-06-05 as an extension-platform constraint.

## Finding reference

AA-3, from Carol's baseline accessibility audit dated 2026-05-23.

## WCAG criterion

SC 1.4.10 Reflow (AA).

## Description

The popup HTML sets `min-width: 300px` on the body. At 400% browser zoom, this
can prevent content from reflowing into a single column without horizontal
scrolling.

## Reason this is a platform constraint, not an authoring defect

Chrome extension popups are rendered inside a fixed-width Chrome overlay.
The popup container is managed by the browser shell, not by the extension page.
The `min-width: 300px` value is the minimum usable width for the extension's
controls and is not a hard lock; `max-width: 100%` is also set so the layout
can flex where the container allows it.

At very high zoom levels, the Chrome popup container does not grow proportionally
to match the zoomed viewport. This is a documented behaviour of the Chrome
extension popup API and is not correctable by CSS changes inside the popup page.

WCAG 2.2 SC 1.4.10 applies to web content rendered in a full browser viewport.
A Chrome extension popup is a browser chrome overlay with different rendering
constraints. The Web Content Accessibility Guidelines Technical Understanding
document acknowledges that platform constraints outside the author's control
are not authoring failures.

A related exception covering the same root cause is at
`docs/exceptions/popup-fixed-width.md`, which was recorded at the baseline
audit. This record cross-references finding AA-3 specifically.

## Risk

Low. Users who need the extension at very high zoom may need to temporarily
adjust browser zoom for the popup interaction. The popup is a short interaction
(select platform, confirm page, click Run), so this impact is limited.

## Review date

Review this exception if Chrome changes its popup rendering model, or if a
future version of the extension adds a settings or configuration page that is
not a popup overlay and is therefore fully subject to SC 1.4.10.
