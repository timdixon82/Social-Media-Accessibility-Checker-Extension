# Privacy: Social Media Accessibility Checker Extension (SMACE)

This document records the privacy posture for SMACE. See also `PRIVACY.md` at the repository root, which is the user-facing privacy policy.

## Analytics

None. The extension does not use any analytics tool.

## Data collection statement

The extension reads LinkedIn post content from the user's current browser tab, including author names, post text, image URLs, and image alt text. This data is processed on the user's device to produce an accessibility report. Nothing is transmitted to any external server.

The only persistent storage is `chrome.storage.local`, which stores the last audit result. This storage is local to the browser and never synchronised to any server. The user can clear it by removing the extension or clearing local storage.

`localStorage` stores only the theme preference (`sm-a11y-theme`). No personal data.

## Third-party services

| Service | Data received | Why needed |
|---|---|---|
| LinkedIn CDN (`media.licdn.com`, `dms.licdn.com`) | Image HTTP GET requests using the user's authenticated session cookies | Required to fetch images for contrast analysis. Images are processed on-device and not forwarded. |

No other third-party service is contacted. The ONNX models are bundled with the extension and loaded from the local extension package, not fetched at runtime.

## UK GDPR obligations

LinkedIn post content includes author names, which are personal data under UK GDPR Article 4(1). Post text may include additional personal data if the author has written about themselves or others.

### Lawful basis

Processing is initiated by the user choosing to run an audit on a page they are already viewing. The author of the LinkedIn post has made the data public on LinkedIn. No server-side processing or storage occurs. This is local-only, user-directed processing for the user's own purpose.

### Retention periods

The last audit result is held in `chrome.storage.local` until the user clears it or removes the extension. No server-side retention exists.

### Data subject rights

Because no data is held on a server, there is nothing for the developer to disclose, correct, or delete on request. Rights of access, rectification, and erasure are exercised by the user through their own browser settings (clearing extension local storage).
