# Social Media Post Accessibility Checker

A Chrome browser extension that audits social-media posts for accessibility issues, including the colour contrast of text in images.

## What it does

The extension checks LinkedIn posts for four common accessibility problems:

- Missing or weak image alt text
- Emoji overuse (more than five emoji in a post)
- Decorative Unicode font characters (invisible to screen readers)
- Insufficient colour contrast in post images (measured against WCAG 2.2 AAA: 7:1 for normal text, 4.5:1 for large text)

All processing happens on your own device. No post data, images, or audit results are sent to any external server. See PRIVACY.md for full details.

## Current scope and roadmap

LinkedIn is the current supported platform. The extension checks posts on LinkedIn company pages and personal profiles.

Expansion to X/Twitter, Facebook, and Instagram is planned. No schedule is set for these platforms. The popup shows them as "coming soon" as a reminder of the intended direction.

## How to install

Load the extension as an unpacked developer extension in Chrome:

1. Run `npm install` followed by `npm run build`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable Developer mode using the toggle in the top-right corner.
4. Select "Load unpacked" and choose the `dist/` folder produced by the build.

## How to use

1. Navigate to a LinkedIn company page or personal profile that shows posts.
2. Select the extension icon in the Chrome toolbar.
3. Choose the number of posts to audit using the slider (1 to 50; default is 10).
4. Select "Run Audit".

A report tab opens and fills in as each post is processed. When all posts are complete, a "Download all reports as ZIP" button appears. The ZIP contains one Markdown file and one PDF file per post.

## Verdict thresholds

The overall pass or fail verdict for image colour contrast uses WCAG 2.2 AAA thresholds:

- Normal text: 7:1 contrast ratio or higher.
- Large text (bounding box height 24 px or more in the canonical resized image): 4.5:1 or higher.

The contrast table in each report also shows the WCAG 2.2 AA result (4.5:1 normal / 3:1 large) for reference.

## Build commands

| Command | What it does |
|---|---|
| `npm run build` | Generates icons and bundles the extension into `dist/` |
| `npm run watch` | Runs webpack in watch mode for development |
| `npm run package` | Builds and packages the extension into a ZIP for distribution |
| `npm run lint` | Runs ESLint, Stylelint, and HTMLHint |

## Privacy

No data leaves your browser. See PRIVACY.md for the full privacy notice.

## Licence

MIT. See the LICENSE file.
