# SMACE Business Analysis: Requirements and Acceptance Criteria

## 1. What the project is

The Social Media Accessibility Checker Extension (SMACE) is a Google Chrome browser extension that lets content creators and communications teams check the accessibility of their LinkedIn posts before or after publishing. The user navigates to a LinkedIn company or personal posts page, clicks the extension icon, chooses how many posts to audit, and clicks Run. The extension scrapes the page, fetches images using the user's existing authenticated session, runs optical character recognition (OCR) on each image using a locally bundled AI model (PP-OCRv5 running in WebAssembly), measures the contrast of any text found in images against their background, and presents a full report in a new browser tab. All processing happens on the user's own device. Nothing is sent to any external server. Exports are available as a downloadable ZIP archive containing one Markdown file and one PDF file per post.

---

## 2. Functional requirements

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

---

## 3. Acceptance criteria

### AC-FR-1 Platform selection

- [ ] The popup shows LinkedIn as a selectable option and it is selected by default.
- [ ] X/Twitter, Facebook, and Instagram are visible but disabled, labelled "coming soon".
- [ ] A screen reader announces each disabled option as unavailable.

### AC-FR-2 Active page detection

- [ ] The popup displays the active tab URL on open.
- [ ] If the URL does not contain "linkedin.com", the Run button is disabled and an error message is announced via the live region.
- [ ] If the URL contains "linkedin.com", the Run button is enabled.

### AC-FR-3 Post count selection

- [ ] The slider accepts integer values from 1 to 50.
- [ ] The default value is 10.
- [ ] The displayed value updates as the slider moves.
- [ ] The aria-valuenow and aria-valuetext attributes update to match the current value.

### AC-FR-4 Post scraping

- [ ] The content script scrolls until the requested number of posts are loaded or 30 scroll attempts are exhausted.
- [ ] Each extracted post object contains author, date, postUrl, text, hasVideo, hasImageDescInText, images, emojiResult, and fontResult fields.
- [ ] "See more" buttons are expanded before text extraction.

### AC-FR-5 Alt text evaluation

- [ ] An image with a genuine non-empty alt attribute receives a PASS result.
- [ ] An image whose alt text matches LinkedIn's placeholder string receives a FAIL result.
- [ ] An image with no alt attribute where the post body contains an image description receives a NOTE result.
- [ ] An image with no alt attribute and no description in the post body receives a FAIL result.

### AC-FR-6 Emoji evaluation

- [ ] A post with five or fewer emoji receives a PASS result.
- [ ] A post with more than five emoji receives a FLAG result.
- [ ] Up to eight example emoji are captured and displayed.

### AC-FR-7 Non-standard Unicode font detection

- [ ] A post containing no characters in the range U+1D400 to U+1D7FF receives a PASS result.
- [ ] A post containing one or more such characters receives a FAIL result with a count and examples.

### AC-FR-8 Image fetching

- [ ] Each image listed in a post's image array is fetched as a base64 data URL.
- [ ] A fetch failure does not stop processing of remaining images or posts.
- [ ] An image that fails to fetch is recorded with an error field; the report card shows "Image could not be fetched".

### AC-FR-9 On-device OCR

- [ ] The sandbox initialises within 120 seconds; if it does not, the report page shows a clear error.
- [ ] Words shorter than 2 characters or with fewer than 2 alphanumeric characters are discarded.
- [ ] Words with confidence below 50 percent (for words of 2 to 5 alphanumeric characters) or below 25 percent (for words of 6 or more) are discarded.
- [ ] Words with a bounding box smaller than 4 by 4 pixels are discarded.

### AC-FR-10 Image contrast analysis

- [ ] For each retained word, a contrast ratio is calculated using sRGB linearisation per IEC 61966-2-1.
- [ ] The bounding box is sampled in at least 3 vertical strips.
- [ ] The strip with the lowest contrast is used as the result for that word.
- [ ] Near-uniform regions (where the two k-means centroids differ by less than 0.02 luminance units) return null, not a false contrast value.

### AC-FR-11 Contrast verdict

- [ ] An image with all colour pairs passing WCAG 2.2 AA receives a PASS verdict.
- [ ] An image with at least one failing AA colour pair receives a FAIL verdict and the failing pair details are shown.
- [ ] An image where OCR finds no usable text receives a NO_TEXT verdict and the card states no contrast data could be extracted.
- [ ] The detail string states the number of failing pairs, the worst foreground and background hex values, the actual ratio, and the required ratio.

### AC-FR-12 Streaming results display

- [ ] The report tab opens before any post data is received.
- [ ] Each post card appears in the report feed as soon as its data arrives from the service worker.
- [ ] Contrast badges update in place once OCR completes, without reloading the page.

### AC-FR-13 Per-post report card

- [ ] Each card is an article element with an aria-label identifying the author and date.
- [ ] The overall badge shows Overall: Pass, Overall: Fail, or Overall: Flag.
- [ ] Overall: Fail is shown when any of: alt text fail, non-standard font fail, or contrast fail is true.
- [ ] Overall: Flag is shown (when not already failing) when emoji count exceeds five.
- [ ] The Expand button toggles a details section, and its aria-expanded attribute reflects the current state.

### AC-FR-14 Expandable contrast detail

- [ ] The contrast table has a caption and column headers with scope="col".
- [ ] Each row shows swatch image, background hex, foreground hex, ratio, AA result, AAA result, WebAIM link, and example words.
- [ ] Swatch images have descriptive alt text stating the background and foreground hex values.
- [ ] Failing region crop images have descriptive alt text.

### AC-FR-15 Full individual report view

- [ ] The report page opens in a new tab when "View full report" is clicked.
- [ ] The page is self-contained HTML and does not require a network request to render.
- [ ] The page has a single H1, then H2 and H3 headings in order with no skipped levels.
- [ ] A print button triggers the browser print dialog.
- [ ] The page respects the theme (light or dark) that was active in the report tab.

### AC-FR-16 ZIP export

- [ ] Clicking the download button creates a ZIP file named with the current date and time.
- [ ] The ZIP contains one .md file and one .pdf file for each post.
- [ ] Each file is named in the pattern author_date_sequence.
- [ ] The Markdown file includes a summary table and per-check detail sections.

### AC-FR-17 Light and dark theme

- [ ] The theme defaults to the operating system preference.
- [ ] The toggle button switches between light and dark modes.
- [ ] The chosen theme is stored in local storage and applied on next load.
- [ ] The theme toggle button has an aria-label that reflects the current action ("Switch to dark mode" or "Switch to light mode").
- [ ] The prefers-reduced-motion media query is respected: all transition durations are set to near zero.

---

## 4. Out of scope

The following items are present in the repository but are not covered by the current requirements or are explicitly excluded by the brief.

- **Chrome Web Store distribution.** The brief excludes any change to the extension's distribution channel.
- **Webpack migration.** The brief excludes migration off webpack to another build tool.
- **Firefox support.** No Firefox manifest or adapter exists; the extension targets Chrome MV3 only.
- **Permissions model changes.** Any change to the declared browser permissions requires a named security review recommendation, per the brief.
- **The root-level analytical scripts.** The files `analyse_contrast.py`, `debug_post.js`, and `linkedin_audit.js` are predecessor scripts used for local development and verification. They are not part of the built extension and are superseded by the bundled JavaScript code. They are retained as reference material.
- **X/Twitter, Facebook, and Instagram auditing.** The popup marks these as "coming soon" but no content scripts, selectors, or adapters exist for them.
- **Video post accessibility.** The extension detects whether a post contains a video (the `hasVideo` flag) but does not audit caption presence or video accessibility.
- **Keyboard navigation of the report feed.** The `role="feed"` is applied to the cards container but no keyboard navigation pattern (arrow keys to move between posts) is implemented.
- **Settings persistence across sessions.** Post count and platform selection are not persisted between popup opens.

---

## 5. Open questions for Tim

- Q-number unset — The extension name in `manifest.json` is "Social Media Post Accessibility Checker" and in `package.json` it is "linkedin-accessibility-auditor". The popup and report page use the manifest name. Should the package name be aligned, or is the discrepancy intentional?

- Q-number unset — The CHROME_EXTENSION_PLAN.md plan file describes an offscreen-document architecture. The actual code uses a sandboxed iframe instead. The plan file is now a misleading record of an earlier design. Should it be deleted or updated to reflect the current architecture?

- Q-number unset — The content script currently only supports LinkedIn selectors. The popup presents X/Twitter, Facebook, and Instagram as "coming soon". Is there a target date or priority order for these platforms, or should the requirements simply record them as future work with no committed timeline?

- Q-number unset — The contrast check reports both WCAG 2.2 AA and AAA results. The overall post verdict uses AA as the pass/fail threshold. Should the overall verdict use AAA to match the team's compliance baseline, or is AA the intended threshold for this tool?

- Q-number unset — The emoji flag threshold is hard-coded at more than 5. Should this threshold be configurable by the user, or is a fixed value the intended design?

---

## 6. What good looks like

A complete, passing audit run opens a report tab in under five seconds for a ten-post audit on a typical LinkedIn company page. Every post card shows a correct overall badge, and each check section clearly states pass, fail, or not applicable with a plain-language reason. Contrast failures display the exact failing colour combination, the measured ratio, the required ratio, and a cropped image of the failing region. The report is navigable by keyboard alone, readable by a screen reader without loss of information, and works correctly in both light and dark modes. The ZIP export produces readable, self-contained files that a team member can share or archive without access to the extension.
