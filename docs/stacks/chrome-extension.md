# Stack Standards: Chrome Manifest V3 Extension

This page records coding standards for Chrome browser extensions built on Manifest V3 (MV3). It applies to this project (SMACE) and to any future browser-extension project in this team.

Stack-independent standards are in the global wiki's `coding-standards.md`. This page records only what is specific to the browser-extension stack.

## Build

- Webpack 5 in production mode. One entry point per extension surface.
- `experiments.asyncWebAssembly: true` is required when bundling ONNX/WASM models.
- `CopyPlugin` copies vendor assets (ONNX models, WASM binaries) from `node_modules` into `dist/vendor/`.
- The `dist/` folder is the built extension. Never commit it; build it in CI.
- A `VERSION` file at the repository root is the single source of truth for the version number. `package.json` and `manifest.json` read from it or are kept in sync by the release script.

## Manifest V3 rules

- Use `manifest_version: 3`. MV3 is the only path for new Chrome Web Store submissions.
- Keep permissions to the minimum viable set. For SMACE: `activeTab`, `scripting`, `storage`, and host permissions scoped to the target site.
- Do not request `tabs`, `history`, `bookmarks`, `cookies`, or `webRequest` unless a feature explicitly requires one and a security review names it.
- `web_accessible_resources` must list only the resources actually needed on the target host. Use the same domain as `host_permissions`, not `<all_urls>`.
- Never use `offscreen` permission unless the sandbox-iframe workaround is not possible.

## Execution contexts

MV3 has four distinct execution contexts. Each has hard constraints:

| Context | DOM | Canvas | SharedArrayBuffer | chrome.* APIs | eval / unsafe-eval |
|---|---|---|---|---|---|
| Service worker | No | No | No | Yes | No |
| Content script | Yes (page DOM) | Yes | No | Subset | No |
| Extension page (app) | Yes | Yes | No* | Yes | No |
| Sandboxed page | Yes | Yes | Yes (with COOP header) | No | wasm-unsafe-eval only |

*SharedArrayBuffer requires cross-origin isolation (`COOP`/`COEP` headers), which extension pages cannot set.

The SMACE data flow follows ADR-003: popup → service worker → content script → service worker → app page → sandbox iframe → app page.

The sandbox iframe is the only valid location for ONNX Runtime Web. Do not attempt to move OCR into the service worker or the app page; it will fail. See [ADR-003](../decisions/003-three-context-data-flow.md) and [ADR-004](../decisions/004-retire-offscreen-page.md).

## Content Security Policy

The extension-wide CSP goes in `manifest.json` under `extension_pages`:

```
script-src 'self'; object-src 'self'
```

The sandbox page gets its own, more permissive CSP in `manifest.json` under `sandbox`:

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'
```

Never add `'unsafe-eval'`, `'unsafe-inline'`, or external origins to the extension-pages CSP.

## postMessage security

- When the app page sends a message to the sandbox iframe, use the exact `chrome-extension://` origin as the target origin. Never use `'*'`.
- When the sandbox page receives a message, check `e.source === window.parent` before processing. Reject all other sources.
- These rules prevent a crafted message from an external page reaching the sandbox, even though Chrome's sandbox isolation makes exploitation impractical today.

See [ADR-001](../decisions/001-manifest-v3-permissions.md) and security finding CR-01.

## Dependencies

- Pin all runtime dependencies to exact versions in `package.json`. No `^` or `>=` ranges.
- Dependabot opens grouped minor and patch pull requests weekly. Major version updates arrive as individual pull requests.
- After any dependency update that touches WASM or ONNX model files, run a full local build and smoke test before merging.

See [ADR-007](../decisions/007-pinned-exact-dependency-versions.md).

## Testing

The project uses a four-layer test suite:

1. Unit tests for `src/core/` functions (pure JavaScript, no Chrome APIs). Tooling: Vitest.
2. Integration tests for the service-worker and content-script message flows. Tooling: Vitest with a Chrome API stub.
3. End-to-end tests: Playwright launching a real Chromium instance with the extension loaded (`--load-extension`), using `xvfb-run` for headless CI.
4. Accessibility checks: Playwright plus axe-core at WCAG 2.2 AAA, run against the app page and the popup in Chromium.

CI must run all four layers. No pull request merges with a failing test.

## Chrome Web Store

Chrome Web Store submission is out of scope for the current build. Distribution is by developer-mode unpacked load from a GitHub Release ZIP. An Architecture Decision Record will record the distribution path when it is in scope.

## Linting

- ESLint with a flat config (`eslint.config.js`). Rules: `eslint:recommended` plus `no-eval`, `no-implied-eval`, `no-new-func`.
- Stylelint with `stylelint-config-standard`.
- HTMLHint with the standard ruleset.
- All three linters are pinned in `devDependencies` and run via `npm run lint`.
- `npm ci` installs from `package-lock.json`. Never `npm install` in CI.
