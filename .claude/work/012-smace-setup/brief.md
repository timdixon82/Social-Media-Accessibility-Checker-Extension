# Brief: 012-smace-setup

## Summary

Adopt and backfill `timdixon82/Social-Media-Accessibility-Checker-Extension`, a Chrome browser extension that checks the accessibility of social-media posts, including the colour contrast in images. The repository has a webpack build, a `manifest.json`, a `package.json`, a `PRIVACY.md`, and source in `src/`. This work runs the project-completeness backfill, then proceeds to wiki scaffolding and the setup build. Setup pending Tim's answers to Q59 and Q60.

- Status: parked
- Branch: none
- Priority: 6
- Blockers: Awaiting Tim's answers to Q59 and Q60

## Requirements

No formal requirements exist. Tad reverse-engineers and records the requirements and acceptance criteria during the backfill.

## Routing plan

1. Sonja clones the repository (completed) and creates this work folder.
2. Four-agent backfill in parallel: Tad (business analysis), Jacob (architecture), Jed (security and code review), Carol (baseline WCAG 2.2 AAA audit). Each writes to its own file in this work folder.
3. Sonja consolidates the findings and surfaces any questions to Tim.
4. Tad scaffolds the project wiki and the `chore/project-setup` branch.
5. Sean adds the team's standard setup (workflows, release-please, lint manifest, VERSION, README, CSP, GoatCounter, etc).
6. Carol verifies and produces the release checklist.
7. Sonja runs the architecture-and-security conformance check and the merge gate, and presents to Tim. Sean opens the pull request; Sonja merges only on Tim's express approval.

## Out of scope

- Any change to extension distribution (the Chrome Web Store).
- Any change to the extension's permissions model unless a security review names one as required.
- Migration off webpack to a different build tool.

## Risk and rollback

Risk: a misconfigured Content Security Policy or a manifest change accidentally breaks the extension in Chrome.

Rollback: the team setup runs on `chore/project-setup` only; main is untouched until Tim's express approval. If the merged change breaks the extension, revert the merge commit.

## Definition of done

- [ ] Four-agent backfill complete and recorded in this work folder.
- [ ] Project wiki scaffolded under `docs/`.
- [ ] VERSION file, expanded README, CSP, self-hosted analytics if a user-facing page is present.
- [ ] Pinned linter manifest with all three linters exit 0.
- [ ] Five workflow files passing `actionlint`.
- [ ] Carol's test pass and release checklist complete.
- [ ] Pull request opened and the merge gate passes.

## Approved GitHub actions

- [x] Create a branch
- [x] Commit to a branch
- [x] Push a branch other than the main branch
- [x] Open a pull request
- [ ] Comment on a pull request or an issue
- [ ] Create an issue

## Not pre-approved

- Merging to the main branch. This always needs Tim's express approval at the time.
- Publishing to the Chrome Web Store.

## Never allowed

The hard deny-list from `CLAUDE.md`.
