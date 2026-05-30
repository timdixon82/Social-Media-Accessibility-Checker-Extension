# Jacob's Architecture Review: Social-Media-Accessibility-Checker-Extension

## 1. Architecture summary

SMACE is a Chrome Manifest V3 (MV3) browser extension that audits LinkedIn posts for four accessibility concerns: missing or weak alt text, emoji overuse, decorative Unicode fonts, and the colour contrast of text inside post images. The build is webpack 5 in production mode, with six entry points: `background/service_worker`, `popup/popup`, `app/app`, `offscreen/offscreen`, `sandbox/sandbox`, and `content/content_script`. Runtime flow is: the popup sends a `startAudit` message to the service worker; the service worker opens a long-lived `app/app.html` tab, injects the content script into the active LinkedIn tab to scrape posts and image URLs, fetches each image with its host-permission CORS bypass, and forwards a base64 data URL to the app page. The app page (which has full DOM and timer rights, unlike the service worker) hosts a hidden sandboxed iframe (`sandbox/sandbox.html`) that runs PaddleOCR PP-OCRv4 via `@gutenye/ocr-browser` on `onnxruntime-web`'s WebAssembly backend. The app page itself runs the WCAG contrast pipeline (`src/core/`), renders progressive cards, and exports per-post Markdown plus PDF in a ZIP. The Python script (`analyse_contrast.py`) and the Playwright scripts (`linkedin_audit.js`, `debug_post.js`) at the repository root are the legacy server-side ancestor of the extension, kept as the source-of-truth reference for the algorithms now ported to `src/core/`.

## 2. Strengths

- Clear, well-bounded modules: `src/core/` is pure data-in / data-out, separated from Chrome APIs and the DOM, which is exactly what an architect wants.
- Manifest V3 with a minimal permission set (`activeTab`, `scripting`, `storage`) and explicit host permissions for LinkedIn and its image CDNs.
- A thoughtful Content Security Policy that drops `'unsafe-eval'` and isolates it to the sandbox page, which is the correct pattern.
- All processing is on-device, with a published `PRIVACY.md` that accurately describes the data flow.
- The README plan (`CHROME_EXTENSION_PLAN.md`) records the architecture in narrative form, which compensates for the lack of formal Architecture Decision Records.
- The sandbox-iframe-in-app-page pattern is a sound workaround for the documented MV3 limitations (service worker has no DOM; offscreen page lacks cross-origin isolation; extension page CSP forbids `'unsafe-eval'`). The pain has been thought through, not papered over.

## 3. Risks and concerns

1. **Hard LinkedIn coupling without a stated platform strategy.** The popup UI implies a multi-platform future (`platformLabel` lists Twitter, Facebook, Instagram), but every selector, host permission, and the content script's logic is LinkedIn-specific. The project name says "Social Media" but the implementation is a LinkedIn auditor. This drift is the largest architectural debt.
2. **Brittle DOM selectors.** Content scraping depends on LinkedIn class names like `feed-shared-update-v2` and `update-components-actor__name`. These change without notice and there is no automated detection of selector drift.
3. **No automated tests at all.** No `tests/` folder, no Vitest, no Playwright, no axe-core harness. Static-front-end and Browser AI Application standards both mandate a four-layer test suite.
4. **`manifest_version` is 3 but the project uses no `offscreen` permission**, yet `webpack.config.js` and the source still bundle and ship `src/offscreen/`. The service worker comment confirms this code path has been abandoned in favour of the sandbox page, but the dead bundle still ships, which inflates the package and confuses reviewers. This is the precise "dead code" anti-pattern called out in the team's coding standards.
5. **Large vendored dependencies with no Subresource Integrity check.** `onnxruntime-web`, `@gutenye/ocr-browser`, `pdfmake`, `marked`, and `jszip` are bundled by webpack, never integrity-hashed, and not pinned to exact versions (`^` ranges). For an extension that loads WASM and runs OCR over user content, this is the highest-residual-risk supply-chain surface.
6. **No linter manifest yet.** The `package.json` carries only build dependencies. The team standard requires pinned HTMLHint, Stylelint, and ESLint in `devDependencies`, with `npm ci` in CI.
7. **No VERSION file at the repository root.** `package.json` and `manifest.json` carry different versions (1.0.0 vs 1.1.4), and there is no single source of truth. The Repository Standards section of `coding-standards.md` requires `VERSION`.
8. **No GitHub Actions workflows in `.github/`.** No CI, no actionlint, no release-please. The setup-build phase will add them.
9. **Legacy Python and Playwright scripts left at the repository root.** `analyse_contrast.py`, `linkedin_audit.js`, and `debug_post.js` are no longer part of the shipped extension. Their continued presence at the root, unmarked, is a comprehension hazard.
10. **`web_accessible_resources` is `<all_urls>`.** Any web page can request the bundled OCR models. The hosting permission scope should be tightened to the host permissions LinkedIn already requires, unless a reason for the wider scope is recorded.

## 4. Proposed Architecture Decision Records

### ADR 0001: Adopt Manifest V3 with the activeTab, scripting, and storage triad

The extension is and stays on Manifest V3. Permissions are kept to `activeTab`, `scripting`, and `storage`, with host permissions narrowly scoped to LinkedIn and its image CDNs. We do not request `tabs`, `cookies`, or broad host permissions. Rationale: Chrome Web Store reviews favour the smallest viable permission set, MV3 is the only path forward for new submissions, and the audit needs no persistent background page.

### ADR 0002: Webpack as the build tool, retained

Webpack 5 in production mode is the build tool, with one entry per extension surface. We do not migrate to Vite or esbuild for the setup build. Rationale: the project already bundles a non-trivial WASM and ONNX-model set through webpack's `CopyPlugin`, and `experiments.asyncWebAssembly` is configured. The brief excludes a bundler migration. Webpack is the right tool for the job at this code size.

### ADR 0003: Legacy Python and Playwright scripts are reference-only artefacts, moved to a `legacy/` folder

`analyse_contrast.py`, `linkedin_audit.js`, and `debug_post.js` are the pre-extension ancestor of `src/core/` and `src/content/`. They are the source-of-truth reference for the WCAG colour math and the LinkedIn DOM logic, but they are not part of the shipped extension. They move into `legacy/` with a one-line `README.md` that names them as reference-only. Rationale: the team's "leave no dead code" rule is non-negotiable in production folders, but the algorithms are a recoverable asset and the Python is the authoritative test oracle for the JavaScript port.

### ADR 0004: Audit-time data flow runs through three contexts, with the rationale recorded

The audit data flow is fixed: popup → service worker → content script (scrape) → service worker (image fetch) → app page (CSP-fenced surface) → sandbox iframe (OCR) → app page (WCAG, render, export). This three-context split is forced by three MV3 constraints: the service worker has no DOM or canvas, the offscreen page lacks cross-origin isolation for SharedArrayBuffer, and the extension-pages CSP forbids `'unsafe-eval'` that `onnxruntime-web`'s threading proxy still relies on. The sandbox iframe is the only context where the OCR runtime can initialise. Rationale: documenting this avoids a future contributor "simplifying" the architecture into a broken state. The offscreen page is retired as a runtime context (see ADR 0006).

### ADR 0005: Permissions and host-permission scope

Permissions are `activeTab`, `scripting`, and `storage` only. Host permissions are limited to `https://www.linkedin.com/*`, `https://media.licdn.com/*`, and `https://dms.licdn.com/*`. `web_accessible_resources` is narrowed from `<all_urls>` to the same host permission list, because the OCR models do not need to be readable by arbitrary websites. Rationale: the principle of least privilege is the OWASP "Broken Access Control" defence on the browser-extension stack.

### ADR 0006: Retire the offscreen page; the sandbox iframe is the OCR home

The `chrome.offscreen` page is removed from `manifest.json`, `webpack.config.js`, and `src/`. The sandbox page (`src/sandbox/sandbox.js` plus `src/adapters/paddle-ocr.js`) is the only OCR runtime. Rationale: the service worker's comment block confirms the offscreen page has been abandoned because it cannot grant SharedArrayBuffer access. Two parallel scaffolds for the same job is the worst of both worlds.

### ADR 0007: Treat the project as a single-platform LinkedIn auditor; multi-platform support is a separate future decision

The popup keeps a single LinkedIn option, all selectors stay LinkedIn-specific, and host permissions stay scoped to LinkedIn. The `platformLabel` enum in `popup.js` is reduced to LinkedIn-only. Multi-platform support is a deliberate future Architecture Decision Record, not an implicit extension. Rationale: the existing "Social Media" name is honest about intent, but every other line of code is LinkedIn-shaped, and pretending otherwise produces dead UI and false advertising.

### ADR 0008: All third-party libraries are pinned to exact versions

The five runtime dependencies (`@gutenye/ocr-browser`, `jszip`, `marked`, `onnxruntime-web`, `pdfmake`) are pinned to exact versions in `package.json` (drop the `^` and `>=` ranges). Dependabot opens grouped minor and patch updates weekly, major updates as individual pull requests. Rationale: this is the Browser AI Application stack rule and the single most important supply-chain defence on a project that loads WASM at runtime.

## 5. Cross-cutting candidates for the global wiki

Three patterns from this project would benefit any future browser-extension or browser-AI project:

1. **A new stack page, `docs/stacks/browser-extension.md`.** The team already has `browser-ai-application.md`; a browser-extension stack page would record the MV3 permission model, the service-worker / content-script / offscreen / sandbox context map, the CSP idioms (`script-src 'self' 'wasm-unsafe-eval'`), and the Chrome Web Store review baseline. SMACE is the first project to drive this.
2. **A pattern at `docs/patterns/mv3-execution-contexts.md`.** A reusable, plain-language explanation of the four MV3 contexts (service worker, content script, offscreen, sandbox), what each can and cannot do (DOM, SharedArrayBuffer, CSP, chrome APIs), and the decision tree for choosing one. ADR 0004 above is the project-specific instance.
3. **A pattern at `docs/patterns/on-device-ocr.md`.** PaddleOCR via `@gutenye/ocr-browser` on `onnxruntime-web` is a substantial integration that other projects (image alt-text checkers, document scanners, accessibility tools) could reuse. Worth recording the model paths, the WASM-proxy `'unsafe-eval'` workaround, and the sandbox-iframe initialisation handshake.

I suggest items 2 and 3 only if Sonja agrees the lessons generalise; the stack page is the higher-value write.

## 6. Open questions for Tim

- **Q59. Multi-platform scope.** The popup hints at Twitter, Facebook, and Instagram, but every line of code is LinkedIn-only. Confirm the intent. (A) LinkedIn only, drop the dormant platform labels (ADR 0007 recommends A). (B) Keep LinkedIn only for now, leave the dormant labels as a place-holder. (C) Add a second platform during this setup.
- **Q60. Legacy script disposition.** What is the future of `analyse_contrast.py`, `linkedin_audit.js`, and `debug_post.js`? (A) Move to `legacy/` with a one-line README, reference-only (ADR 0003 recommends A). (B) Delete entirely; the git history preserves them. (C) Keep at the root as supported tools.
- **Q61. Offscreen-page removal.** Delete the unused offscreen page entirely (ADR 0006), or keep it parked for a possible future re-enable? (A) Delete (recommended). (B) Keep parked, with a comment.
- **Q62. Distribution.** Chrome Web Store submission is out of scope for this work folder, but should an Architecture Decision Record record the intended distribution path (unpacked developer load, private Web Store, public Web Store) so later decisions have a frame? (A) Yes, record as future ADR; (B) No, defer until distribution is in scope.
- **Q63. Browser-extension stack page.** The team has no `docs/stacks/browser-extension.md`. Should we write one now from this project (recommended), or defer until a second extension arrives? (A) Write now; (B) Defer.
- **Q64. `web_accessible_resources` scope.** Confirm narrowing `web_accessible_resources` from `<all_urls>` to the LinkedIn host list (ADR 0005). (A) Narrow as recommended; (B) Keep `<all_urls>` because of a reason I should know about.
