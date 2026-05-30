# Requirements: Social Media Accessibility Checker Extension (SMACE)

Migrated from `.claude/work/012-smace-setup/tad-requirements.md` on 2026-05-30.

## Background

SMACE is a Google Chrome browser extension that lets content creators and communications teams check the accessibility of their LinkedIn posts before or after publishing. The user navigates to a LinkedIn company or personal posts page, clicks the extension icon, chooses how many posts to audit, and clicks Run. The extension scrapes the page, fetches images using the user's existing authenticated session, runs optical character recognition (OCR) on each image using a locally bundled AI model (PP-OCRv5 running in WebAssembly), measures the contrast of any text found in images against their background, and presents a full report in a new browser tab. All processing happens on the user's own device. Nothing is sent to any external server. Exports are available as a downloadable ZIP archive containing one Markdown file and one PDF file per post.

## User stories

1. As a content creator, I want to audit the accessibility of my LinkedIn posts before they go public so that I can fix any issues before my audience encounters them.
2. As a communications team member, I want to audit a company LinkedIn page's recent posts so that I can produce an accessibility report for stakeholders.
3. As a screen reader user, I want the extension report itself to be fully accessible so that I can use it without a sighted colleague.

## Functional requirements

### FR-1 Platform selection

The extension popup presents a platform selector. LinkedIn is the only enabled platform today. X/Twitter, Facebook, and Instagram are shown as "coming soon" and cannot be selected.

### FR-2 Active page detection

On opening, the popup detects the URL of the active tab and displays it. If the URL does not belong to the selected platform, the popup shows an error and disables the Run button.

### FR-3 Post count selection

The user selects the number of posts to audit using a slider, from 1 to 50. The default is 10.

### FR-4 Post scraping

When the user clicks Run, the extension injects a content script into the active LinkedIn tab. The script scrolls the page until the requested number of posts are loaded, expanding any "see more" buttons found, then extracts for each post: author name, relative date, post URL, full text, a flag for embedded video, a flag for image descriptions written in the post body, image URLs, and image alt text attributes.

### FR-5 Alt text evaluation

For each image in a post, the extension evaluates whether a genuine alt text description is present. It treats LinkedIn's placeholder text ("no alternative text description for this image") as a failure, not as a genuine description.

### FR-6 Emoji evaluation

For each post, the extension counts emoji characters in the post text. A count above five is flagged as a potential accessibility barrier. Up to eight example emoji are captured.

### FR-7 Non-standard Unicode font detection

For each post, the extension scans the text for Unicode mathematical alphanumeric characters (code points U+1D400 to U+1D7FF) used as decorative bold or italic text. These are invisible to screen readers. Any occurrence counts as a failure.

### FR-8 Image fetching

For each image found in a post, the service worker fetches the image as a data URL. The extension's host permissions for linkedin.com and media.licdn.com allow this fetch without cross-origin restrictions.

### FR-9 On-device OCR

Each fetched image is resized to a canonical width, then passed to the OCR sandbox via postMessage. The sandbox runs PP-OCRv4 ONNX models bundled with the extension. It returns word detections with bounding boxes and confidence scores. Words shorter than two characters, fewer than two alphanumeric characters, below the confidence threshold, or with bounding boxes smaller than 4 by 4 pixels are discarded.

### FR-10 Image contrast analysis

For each retained word detection, the extension measures the WCAG 2.2 colour contrast ratio between the text pixels and the background pixels. It uses a one-dimensional k-means algorithm (k = 2) on pixel luminance values, treating the minority cluster as foreground (text) and the majority as background. It samples the bounding box in narrow vertical strips and takes the lowest contrast found across all strips. Similar colour combinations are merged into unique colour pairs, retaining the worst contrast seen.

### FR-11 Contrast verdict

Each colour pair is rated against WCAG 2.2 AA (4.5:1 for normal text, 3:1 for large text) and AAA (7:1 for normal, 4.5:1 for large). A bounding box height of 24 pixels or more counts as large text. An image with at least one failing pair receives a FAIL verdict. An image with no detected text receives a NO_TEXT verdict.

### FR-12 Streaming results display

The report tab opens before scraping is complete. Each post card appears in the report as its data arrives. Contrast analysis results fill in once OCR finishes, without requiring a page reload.

### FR-13 Per-post report card

Each post card shows: author, date, platform, a link to the original post, a preview of the post text, an overall pass/fail/flag badge, quick status badges for emoji, fonts, alt text, and contrast, and expandable detail for each check.

### FR-14 Expandable contrast detail

The contrast detail section of each card lists every unique colour pair found in each image, showing foreground hex, background hex, contrast ratio, AA result, AAA result, a colour swatch, example words, and a link to the WebAIM Contrast Checker tool for that pair. For failing pairs, a cropped image of the failing region is shown with the bounding boxes outlined.

### FR-15 Full individual report view

Each post card has a "View full report" button that opens a self-contained HTML page in a new tab. This page includes all check results, images, colour tables, failing region crops, a print button, and support for both light and dark themes.

### FR-16 ZIP export

Once all posts are processed, a "Download all reports as ZIP" button appears. Clicking it creates a ZIP archive containing one Markdown file and one PDF file per post, named by author, date, and sequence number.

### FR-17 Light and dark theme

The report page supports light mode, dark mode, and a manual theme toggle. The theme preference is stored in local storage.

## Non-functional requirements

### Accessibility

WCAG 2.2 AAA conformance. See `docs/accessibility.md` and the team's global `accessibility.md` for specifics.

### Security

OWASP Top 10 mitigations applied. No paid third-party CI tokens; all scanning uses free, self-contained tooling (`semgrep scan --config p/default --error`, not `semgrep ci`). See `docs/security-review.md`.

### Performance

A complete, passing audit run opens a report tab in under five seconds for a ten-post audit on a typical LinkedIn company page.

### Data protection

The extension reads LinkedIn post content (including author names) from the user's current browser tab. All processing is on-device. Nothing is transmitted to any external server. Chrome local storage holds the last audit result only. See `docs/privacy.md` for the full UK GDPR assessment.

## Out of scope

- Chrome Web Store distribution (excluded from the current build scope).
- Webpack migration to another build tool.
- Firefox support. The extension targets Chrome MV3 only.
- Permissions model changes (require a named security review recommendation).
- X/Twitter, Facebook, and Instagram auditing. The popup marks these as "coming soon" but no content scripts or adapters exist.
- Video post accessibility (caption presence or video accessibility checks).
- Keyboard navigation of the report feed using arrow keys.
- Settings persistence across sessions.

## Definition of done

- All functional requirements pass their acceptance criteria (see `.claude/work/012-smace-setup/tad-requirements.md` for full AC list).
- WCAG 2.2 AAA: no new violations introduced; existing violations tracked in exceptions.
- All CI checks pass: lint, build, security scan, Playwright accessibility tests.
- Carol has signed off functional, accessibility, and visual testing.
- Sonja has approved the merge.
- Tim has given express approval.
