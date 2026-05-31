# Security Review: Social Media Post Accessibility Checker Extension (SMACE)

**Reviewer:** Jed  
**Date:** 2026-05-23  
**Repository:** timdixon82/Social-Media-Accessibility-Checker-Extension  
**Extension version reviewed:** 1.1.4  

---

## 1. Code-Review Findings

### Finding CR-01: postMessage origin not validated in sandbox and app page

**Severity:** Medium

**File:** `src/sandbox/sandbox.js` (line 13); `src/app/app.js` (line 59)

The sandbox page receives all `message` events from `window.addEventListener('message', ...)` without checking `e.origin`. Any page with a reference to the sandbox iframe could post a crafted message claiming to be the app page. Similarly, `app.js` filters by `e.source !== ocrFrame.contentWindow`, which is correct for the sandbox result listener, but the `init` flow sends to `'*'` as the target origin.

The sandbox is a Chrome extension sandboxed page, which means it has no `chrome.*` APIs and is isolated from the web, so exploitation from an external web page is not possible in practice. However, it is a defence gap if Chrome's sandboxing ever allows cross-origin access.

**Recommended fix:** In `sandbox.js`, check that `e.source === window.parent` before processing any message. In `app.js`, pass the exact `chrome-extension://` origin rather than `'*'` to `postMessage` calls targeting the sandbox.

---

### Finding CR-02: `web_accessible_resources` uses `<all_urls>` match

**Severity:** Medium

**File:** `manifest.json` (lines 30–35)

```json
"web_accessible_resources": [
  {
    "resources": ["vendor/*", "vendor/ort/*", "vendor/models/*"],
    "matches": ["<all_urls>"]
  }
]
```

This allows any web page to load the extension's ONNX model files and WASM binaries by URL. The files are read-only ML models and WASM, so there is no code-execution risk from loading them. However, exposing them to all URLs lets any web page detect that this extension is installed by attempting `fetch()` on a known extension resource URL, breaking extension anonymity.

**Recommended fix:** Change `matches` to `["https://www.linkedin.com/*"]` since these vendor assets are only needed on LinkedIn pages during an audit.

---

### Finding CR-03: No timeout guard for `waitForAppPort` leads to silent hang

**Severity:** Low

**File:** `src/background/service_worker.js` (line 97)

`waitForAppPort` resolves after 30 seconds even if no app port connects. If that timeout fires and no port is connected, `appPort` remains null and subsequent `sendToApp` calls silently drop all messages. The user sees no error or audit result. This is a robustness gap rather than a security issue, but a hung service worker with an unresponsive app tab could confuse users about where the audit is.

**Recommended fix:** When the 30-second timeout fires without a port, send an error message via `chrome.tabs` to the newly created app tab, or close it.

---

### Finding CR-04: Image `content-type` header value echoed into a data URL

**Severity:** Low

**File:** `src/background/service_worker.js` (lines 92–94)

```js
const type = resp.headers.get('content-type') || 'image/jpeg';
return `data:${type};base64,${btoa(binary)}`;
```

The `Content-Type` header from LinkedIn's CDN is interpolated directly into the data URL MIME type without sanitisation. If LinkedIn's CDN ever returned an unexpected or malformed content-type (for example `text/html; charset=utf-8`), the data URL would embed that type. Browsers evaluate data URLs in the context of the caller's origin. Because the caller here is the extension service worker (a privileged context), a `text/html` data URL could render as an HTML document if the value were later set as an `iframe src`. In the current code path the data URL is only used as an image `src`, so exploitation would require an additional bug that treats the data URL as an iframe source. The risk is low but real.

**Recommended fix:** Strip or allowlist the content-type to `image/jpeg`, `image/png`, `image/webp`, or `image/gif` before building the data URL.

---

### Finding CR-05: `marked` listed in `package.json` but not imported anywhere in source

**Severity:** Info

**File:** `package.json` (line 17)

The `marked` package (Markdown-to-HTML renderer) appears in `dependencies` but is not imported in any source file under `src/`. Unused dependencies increase the attack surface and the bundle size.

**Recommended fix:** Remove `marked` from `package.json` if it is not used.

---

### Finding CR-06: Error messages from fetch failures passed to UI without sanitisation

**Severity:** Info

**File:** `src/background/service_worker.js` (line 17)

Error messages from rejected promises are passed directly to the app page as `err.message`. These messages come from internal JavaScript runtime errors or network responses, not from untrusted user input, so there is no injection risk. The UI renders them as `textContent` (not `innerHTML`), so they cannot cause XSS.

No fix required. Noted for completeness.

---

## 2. OWASP Top 10 Mapping

| OWASP Category | Finding | Defence in Place | Gap |
|---|---|---|---|
| A01 Broken Access Control | CR-01 (postMessage origin) | Extension sandbox isolation; source-check on app side | Target origin should be locked, not `'*'` |
| A03 Injection | CR-04 (content-type echo) | Data URL used only as image src; UI uses textContent not innerHTML | Allowlist MIME type |
| A05 Security Misconfiguration | CR-02 (all_urls WAR) | WASM/model files are read-only | Scope WAR to LinkedIn only |
| A06 Vulnerable Components | CR-05 (unused marked) | No exploit path found | Remove unused dependency |
| A08 Software and Data Integrity Failures | Vendor ONNX/WASM loaded from extension bundle | Files bundled at build time, not fetched at runtime from CDN per-use | Good; one-time CDN download on install is cached locally |

No findings map to A02 (Cryptographic Failures), A04 (Insecure Design), A07 (Identification and Authentication Failures), A09 (Security Logging and Monitoring Failures), or A10 (Server-Side Request Forgery). Those categories do not apply to a local-only, no-login browser extension.

---

## 3. Permission-Model Assessment

**Declared permissions:**

| Permission | Declared | Justified |
|---|---|---|
| `activeTab` | Yes | Used to inject the content script into the active LinkedIn tab |
| `scripting` | Yes | Required to execute `content_script.js` programmatically |
| `storage` | Yes | Used to cache the last audit result in browser local storage |

**Host permissions:**

| Host | Declared | Justified |
|---|---|---|
| `https://www.linkedin.com/*` | Yes | Content script runs on LinkedIn company pages |
| `https://media.licdn.com/*` | Yes | LinkedIn CDN; images fetched here for contrast analysis |
| `https://dms.licdn.com/*` | Yes | Secondary LinkedIn CDN; used for some image types |

**Assessment:** The permission set is well-scoped for the stated function. The extension does not request `tabs` (broad tab listing), `history`, `bookmarks`, `cookies`, `webRequest`, or any permission beyond what the feature requires. `activeTab` is the narrowest way to inject a content script; it grants access only to the tab the user is currently viewing, and only when the user clicks the extension button.

The only improvement is narrowing `web_accessible_resources` (Finding CR-02). All other permissions are justified at minimum-privilege.

---

## 4. Data-Flow Assessment

**Data the extension reads from LinkedIn pages:**

The content script (`content_script.js`) reads from the Document Object Model of the current LinkedIn tab:

- Post text (`.feed-shared-update-v2__description` and related selectors)
- Author name from actor elements
- Relative timestamp from actor sub-description
- Post URL constructed from `data-urn` attribute
- Image `src` URLs and `alt` attributes from media containers

**Where data goes:**

All data stays within the user's browser. The flow is:

1. Content script reads post data and returns it to the service worker via `chrome.tabs.sendMessage`.
2. Service worker fetches image binary from LinkedIn CDN (host-permitted) and converts it to a data URL.
3. Data (post text, image data URLs) is sent to the app page via `chrome.runtime.Port.postMessage`.
4. App page passes image data URLs to the sandboxed iframe via `postMessage` for OCR.
5. OCR results return from sandbox to app page via `postMessage`.
6. Analysis results are rendered in the app page DOM.
7. The last audit result may be written to `chrome.storage.local` (browser local storage).

**External network calls made by the extension:**

- Image fetches from `media.licdn.com` and `dms.licdn.com`: these are the LinkedIn CDN domains declared in `host_permissions`. The images are fetched to the service worker and converted locally; they are not proxied or forwarded to any third-party server.
- ONNX model files: downloaded once from the npm package's CDN on first install (via the `postinstall` script that copies from `node_modules`), then cached in the extension bundle. After install, no further CDN calls are made.

**Storage:**

- `chrome.storage.local`: the last audit result may be stored here. This storage is local to the browser and never synchronised to any server. The data held is audit results (post text snippets, image data URLs, contrast findings) — no authentication tokens or credentials.
- `localStorage`: used only for theme preference (`sm-a11y-theme`). No personal data.

**Verdict:** No personal data is transmitted outside the browser. The extension is a local-only processor.

---

## 5. Compliance Posture: UK GDPR

**Personal data in scope:**

The extension reads LinkedIn post content including author names, post text, and linked images. Author names are personal data under UK GDPR Article 4(1). Post text may contain additional personal data if the author has written about themselves or others.

**Lawful basis:**

Processing is initiated by the user choosing to run an audit on a page they are already viewing. This falls within the user's own legitimate use of the tool. The author of the LinkedIn post has made the data public on LinkedIn. No basis registration is required for a local-only processing tool that does not collect or store data on a server.

**Data minimisation:**

The extension reads only the data visible on the current LinkedIn page and only processes it to produce an accessibility report. It does not harvest data in bulk or send it anywhere.

**Retention:**

The only persistent storage is `chrome.storage.local`, which stores the last audit result. The `PRIVACY.md` correctly discloses this and states that the user can clear it by removing the extension or clearing local storage. There is no server-side retention.

**Data subject rights:**

Because no data is held on a server, there is nothing for the developer to disclose, correct, or delete on request. Rights of access, rectification, and erasure are exercised by the user through their own browser settings.

**Privacy notice:**

`PRIVACY.md` covers the required disclosures accurately: what is read, how it is processed, what is stored, and what is not transmitted. Contact details are provided. The notice is up to date.

**Compliance verdict:** No UK GDPR deficiencies identified. The extension is local-only, collects no data on a server, and the privacy notice is accurate.

---

## 6. Open Questions for Tim

These questions are gathered here for Sonja to number and batch to Tim.

- Q-number unset — The `web_accessible_resources` entry uses `<all_urls>`. This allows any web page to detect that the extension is installed by probing known resource URLs. The fix (narrowing the match to `https://www.linkedin.com/*`) is low-risk. Should Sean apply this fix as part of the project setup, or defer it?

- Q-number unset — The `marked` package is listed in `package.json` as a production dependency but is not imported anywhere in the current source. Should Sean remove it as part of the setup, or does Tim intend to use it in a future feature?

- Q-number unset — The `analyse_contrast.py` file at the repository root appears to be a development or research script rather than part of the extension itself. It is not referenced by the build and requires Python and PaddleOCR on the developer's machine. Should it be kept in the repository (with a note in the README), or moved to a `scripts/` subdirectory or removed?
