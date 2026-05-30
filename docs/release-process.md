# Release process: Social Media Accessibility Checker Extension (SMACE)

## Branching model

`main` is the production branch. Feature work happens on short-lived branches named by type and scope, for example `feat/alt-text-improvements` or `fix/focus-ring`. No long-lived development branches.

## Pull-request flow

1. Open a pull request from a feature branch to `main`.
2. Continuous integration checks pass: webpack build, accessibility (Playwright + axe-core at WCAG 2.2 AAA), security (CodeQL, Trivy, dependency review, Semgrep).
3. Carol signs off functional, accessibility, and visual testing.
4. Sonja reviews for architecture and security conformance.
5. Tim gives express approval to merge.
6. Sonja merges.

## Merge gate

- All required CI checks pass.
- Carol has signed off.
- The architecture-and-security conformance check has passed.
- Tim has given express approval.

## Release steps

SMACE is distributed as a locally loaded extension (developer mode). There is no automated Chrome Web Store upload at this time.

Release-please manages the changelog and version bump automatically on every merge to `main`. When release-please creates a release pull request:

1. Sonja reviews the changelog and confirms the version bump is correct.
2. Tim approves the release PR.
3. Sonja merges the release PR.
4. The GitHub Release is created automatically with a ZIP artifact of the `dist/` folder (if a release workflow is configured).

To install or update the extension from the GitHub Release:
1. Download the ZIP artifact from the GitHub Release.
2. Extract it.
3. Open `chrome://extensions`.
4. Enable "Developer mode".
5. Click "Load unpacked" and select the extracted folder.
