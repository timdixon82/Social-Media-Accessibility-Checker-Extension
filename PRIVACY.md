# Privacy Policy — Social Media Post Accessibility Checker

**Last updated: 18 May 2026**

## Summary

This extension processes LinkedIn posts entirely on your device. It does not collect, transmit, or share any data. Nothing leaves your browser.

---

## What the extension does

The Social Media Post Accessibility Checker is a browser extension that audits LinkedIn posts for accessibility issues: missing or poor alt text on images, excessive emoji use, decorative Unicode fonts, and insufficient colour contrast in image text. It is designed to help content creators and communications teams ensure their posts meet WCAG accessibility guidelines.

---

## Data collected

This extension does not collect any personal data. It does not use analytics, tracking pixels, crash reporters, or any third-party data services.

---

## Data accessed and how it is used

When you run an audit, the extension reads the content of the LinkedIn page you are currently viewing — specifically post text, author names, images, and alt text attributes. This content is processed locally on your device to generate an accessibility report. No part of this content is transmitted to any external server or service.

Image data is analysed locally using an on-device OCR model (PP-OCRv5) running entirely within your browser via WebAssembly. The model files are downloaded once from a content delivery network on first use and then cached locally in your browser's storage. After that initial download, the extension works fully offline.

Audit results may be temporarily stored in your browser's local storage so you can reopen the last report. This data never leaves your device and can be cleared at any time by removing the extension or clearing your browser's local storage.

---

## Permissions used

The extension requests the following browser permissions:

- **activeTab and scripting** — to read the LinkedIn page you are currently viewing when you choose to run an audit.
- **storage** — to save your last audit result locally in the browser so you can reopen it.
- **host permissions for linkedin.com and media.licdn.com** — to fetch LinkedIn images for colour contrast analysis. Images are fetched directly to your device and are not forwarded anywhere.

---

## Data sharing

This extension does not share any data with any third party, including the developer. There are no advertising networks, analytics services, or data brokers involved.

---

## Children

This extension is not directed at children and does not knowingly process any data relating to children.

---

## Changes to this policy

If this policy changes in a material way, the updated version will be published at the same URL with an updated date at the top. Continued use of the extension after a change constitutes acceptance of the updated policy.

---

## Contact

For questions about this privacy policy, contact Tim Dixon at tim@dixon-net.com.
