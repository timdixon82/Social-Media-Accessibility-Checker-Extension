# Security Review: Social Media Accessibility Checker Extension (SMACE)

Reviewer: Jed
Date: 2026-05-23
Branch reviewed: Initial source (commit 8153646)
Scope: OWASP Top 10 mapping, Chrome extension permission model, data-flow assessment, UK GDPR compliance

Migrated from `.claude/work/012-smace-setup/jed-security-review.md` on 2026-05-30.

## Verdict

SAFE WITH CHANGES. Five findings require resolution before the first public release. Two are medium severity, two are low, and one is informational. The extension has a sound on-device architecture with a well-scoped permission set; the findings are targeted improvements, not fundamental design problems.

## OWASP Top 10 assessment

| OWASP Category | Finding | Defence in Place | Gap |
|---|---|---|---|
| A01 Broken Access Control | CR-01 (postMessage origin) | Extension sandbox isolation; source-check on app side | Target origin should be locked, not `'*'` |
| A03 Injection | CR-04 (content-type echo) | Data URL used only as image src; UI uses textContent not innerHTML | Allowlist MIME type |
| A05 Security Misconfiguration | CR-02 (all_urls WAR) | WASM/model files are read-only | Scope WAR to LinkedIn only |
| A06 Vulnerable Components | CR-05 (unused marked) | No exploit path found | Remove unused dependency |
| A08 Software and Data Integrity Failures | Vendor ONNX/WASM loaded from extension bundle | Files bundled at build time, not fetched at runtime from CDN per-use | Sound; one-time CDN download on install is cached locally |

A02, A04, A07, A09, and A10 do not apply to a local-only, no-login browser extension.

## Findings

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| CR-01 | Medium | `postMessage` origin not validated in sandbox and app page. | Open |
| CR-02 | Medium | `web_accessible_resources` uses `<all_urls>` — any page can detect extension install. | Open |
| CR-03 | Low | No timeout guard in `waitForAppPort` — silent hang if app port never connects. | Open |
| CR-04 | Low | LinkedIn CDN `content-type` header echoed into data URL MIME type without sanitisation. | Open |
| CR-05 | Info | `marked` package in `package.json` but not imported anywhere. | Open |

### CR-01 detail

`sandbox.js` line 13 receives all `message` events without checking `e.origin`. Fix: check `e.source === window.parent` before processing. In `app.js`, pass the exact `chrome-extension://` origin rather than `'*'` to `postMessage` calls targeting the sandbox.

### CR-02 detail

`manifest.json` lines 30–35 set `matches: ["<all_urls>"]` for `web_accessible_resources`. Fix: change to `["https://www.linkedin.com/*"]`. Coordinated with ADR-0005.

### CR-03 detail

`service_worker.js` line 97 `waitForAppPort` resolves after 30 seconds even if no port connects. Fix: when timeout fires without a port, send an error message to the app tab or close it.

### CR-04 detail

`service_worker.js` lines 92–94 interpolate `resp.headers.get('content-type')` directly into the data URL MIME type. Fix: allowlist to `image/jpeg`, `image/png`, `image/webp`, `image/gif`.

### CR-05 detail

`marked` package in `package.json` is not imported in any source file. Fix: remove from `package.json`.

## Continuous integration checks

- CodeQL analysis: pending (added in template onboarding, 2026-05-30)
- Trivy vulnerability scan: pending (added in template onboarding, 2026-05-30)
- Dependency review: pending (added in template onboarding, 2026-05-30 — public repo)
- Semgrep scan (`semgrep scan --config p/default --error`, token-free): pending (added in template onboarding, 2026-05-30)

## Permission model assessment

| Permission | Declared | Justified |
|---|---|---|
| `activeTab` | Yes | Injects content script into the active LinkedIn tab |
| `scripting` | Yes | Required to execute `content_script.js` programmatically |
| `storage` | Yes | Caches the last audit result in browser local storage |
| `https://www.linkedin.com/*` | Yes | Content script runs on LinkedIn pages |
| `https://media.licdn.com/*` | Yes | LinkedIn CDN; images fetched for contrast analysis |
| `https://dms.licdn.com/*` | Yes | Secondary LinkedIn CDN |

Permission set is well-scoped. No `tabs`, `history`, `bookmarks`, `cookies`, or `webRequest` requested.

## UK GDPR compliance

The extension reads LinkedIn post content (author names, post text, image URLs) from the user's current tab. All processing is on-device. No data is transmitted to any external server. `chrome.storage.local` holds the last audit result only. `PRIVACY.md` covers the required disclosures accurately.

Compliance verdict: no UK GDPR deficiencies identified. The extension is local-only.

## Release condition

All five findings (CR-01 through CR-05) must be resolved before the first public release. CR-01 and CR-02 are the highest priority. CI checks must pass (CodeQL, Trivy, dependency review, Semgrep).
