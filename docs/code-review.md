# Code Review and Penetration Test: Social Media Accessibility Checker Extension (SMACE)

Reviewer: Jed (penetration tester and code reviewer)
Date: 2026-05-23
Branch reviewed: Initial source (commit 8153646)
Scope: OWASP Top 10 mapping, Chrome extension permission model, postMessage security, CSP, supply chain

See `docs/security-review.md` for the full findings, OWASP mapping, permission model assessment, data-flow assessment, and UK GDPR compliance verdict.

## Confirmed absences (no finding)

- No hard-coded secrets, API keys, tokens, or passwords.
- No mixed content (the extension uses no HTTPS pages; it operates within chrome-extension:// and on LinkedIn via host permissions).
- No `eval` or `Function` constructor used in extension pages (only `wasm-unsafe-eval` in the isolated sandbox page, which is correct).
- No `outerHTML` or `insertAdjacentHTML` usage.
- No unvalidated URL parameters read into the DOM.
- Content Security Policy is present: `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` scoped to extension pages; the `wasm-unsafe-eval` is isolated to the sandbox page.
- No external scripts, stylesheets, or fonts loaded from CDNs at runtime.

## Summary

Five findings, none critical. Two medium, two low, one informational. The extension has a sound on-device architecture. The permission set is well-scoped. Full detail in `docs/security-review.md`.

### Findings by severity

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 |
| Low | 2 |
| Informational | 1 |

## Review metadata

Tool calls used: Read, Grep on source files; manifest.json inspection.
Approximate duration: one specialist turn.
Automated scanners run: none at time of review (CI workflows not yet present); Semgrep, Trivy, and CodeQL added during template onboarding 2026-05-30.
