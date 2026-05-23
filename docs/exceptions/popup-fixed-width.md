# Exception: Popup fixed width at high zoom levels

## Status

Accepted. Documented 2026-05-23 as an extension-platform constraint.

## WCAG criterion

SC 1.4.10 Reflow (AA).

## Description

The popup HTML fixes the body width to `300px`. At very high browser zoom levels (above 400%), this can cause content to be cut off without a scroll mechanism.

## Reason this is a platform constraint, not an authoring defect

Chrome extension popups are rendered inside a fixed-width Chrome overlay. The width of an extension popup is constrained by the browser's popup container. The `width: 300px` declaration is the extension's minimum usable width rather than an absolute lock. The CSS has been updated to use `min-width: 300px; max-width: 100%` to allow some flex, but the popup container itself limits how much flex is possible.

This is fundamentally a Chrome extension platform constraint. WCAG 2.2 SC 1.4.10 applies to web pages; this is a browser chrome overlay with different rendering rules.

## Risk

Low. The fixed width is a known Chrome extension design pattern. Content creators who need to use the extension at very high zoom may need to adjust their browser zoom for the popup interaction only.

## Review date

Review this exception when Chrome changes its popup rendering model or when the extension adds a full-page settings UI that is subject to the full SC 1.4.10 requirement.
