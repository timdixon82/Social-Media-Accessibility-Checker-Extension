# Project Log: Social Media Post Accessibility Checker (SMACE)

This log is chronological and append-only.

## [2026-05-23] ingest | Project adoption backfill

Four-agent backfill completed for SMACE:

- Tad: reverse-engineered requirements and acceptance criteria (17 functional requirements, 17 acceptance criterion sets). Key findings: the project name is "Social Media Post Accessibility Checker" (manifest) but the npm package name is "linkedin-accessibility-auditor". The extension supports LinkedIn only; X/Twitter, Facebook, and Instagram are labelled "coming soon" in the popup.
- Jacob: architecture review. Eight Architecture Decision Records proposed. Notable concerns: no tests, no linter manifest, no VERSION file, offscreen page dead code, `web_accessible_resources` scoped to `<all_urls>`, `marked` dependency unused.
- Jed: security review. Five findings (CR-01 to CR-05). Medium findings: postMessage origin not validated in sandbox (CR-01), `web_accessible_resources` `<all_urls>` allows extension detection (CR-02). Low findings: service worker hang on app port timeout (CR-03), content-type header echoed into data URL (CR-04). Info: unused `marked` dependency (CR-05).
- Carol: WCAG 2.2 AAA baseline audit. Six Level A findings, two Level AA findings, six Level AAA gaps. Most urgent: badge icon Unicode symbols; duplicate `aria-labelledby` IDs; focus jumping to each new card; contrast issues in popup.

## [2026-05-23] ingest | Q59 and Q60 answers from Tim

Tim answered Q59 and Q60:
- Q59: keep the current name. Do not rename to "LinkedIn Accessibility Checker". Add a "Current scope and roadmap" section to project documentation naming LinkedIn as the current scope and X/Twitter, Facebook, and Instagram as planned expansion with no schedule.
- Q60A: raise the overall verdict threshold from WCAG 2.2 AA to AAA across the extension.

## [2026-05-23] build | Setup build — chore/project-setup branch

Sean ran the setup build on branch `chore/project-setup`. Commits:

1. `a2f3e27` chore: pin linter manifest, runtime deps, and add VERSION
2. `7d54cb7` feat(contrast): raise overall verdict threshold to WCAG 2.2 AAA (Q60A)
3. `660bc0b` docs: add scope and roadmap section to README (Q59)
4. `2765b37` chore: add GitHub Actions workflows (CI, security, accessibility, CodeQL, release-please)
5. `65802c2` chore: add release-please config and manifest
6. `bd0507d` chore: add MIT LICENSE
7. (this commit) chore: scaffold project wiki

Autonomous decisions taken during the build:
- Removed the unused `marked` dependency from `package.json` (Jed CR-05; no question needed — removing an unused dependency is unambiguous housekeeping).
- Pinned `manifest.json` version (1.1.4) as the canonical version and aligned `package.json` to match (was 1.0.0).
- Set `min-width: 300px; max-width: 100%` on popup body as a low-risk improvement; documented the remaining platform constraint as an exception.
- The accessibility workflow uses HTMLHint and ESLint as a static proxy because Chrome extension pages cannot be served to a CLI accessibility tool without a running browser instance. This gap is recorded in accessibility.md and is deferred to Carol's test pass.
