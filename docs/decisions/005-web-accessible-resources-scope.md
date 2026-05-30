# ADR-005: Narrow web_accessible_resources to LinkedIn host permissions

## Status

State: Active

## Decision

`web_accessible_resources` in `manifest.json` is narrowed from `"matches": ["<all_urls>"]` to `"matches": ["https://www.linkedin.com/*"]`, matching the extension's declared host permissions.

## Rationale

The OCR models do not need to be readable by arbitrary websites. The `<all_urls>` match allows any web page to detect the extension is installed by probing known resource URLs, breaking extension anonymity. The principle of least privilege is the OWASP "Broken Access Control" defence on the browser-extension stack.

## Source

Jacob's architecture review and Jed's security review (finding CR-02), 2026-05-23.
