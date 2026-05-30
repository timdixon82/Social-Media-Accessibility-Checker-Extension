# Questions: 012-smace-setup

Questions migrated from outputs/questions.md. Format mirrors the per-folder questions.md contract from tad-requirements.md (work folder 020).

For the global question format rules, see docs/decisions/005-question-format.md.

### Q59: SMACE platform-scope, LinkedIn-only or multi-platform

- Status: open.
- Asked: 2026-05-23, by Jacob in the SMACE backfill (work folder 012).

The popup advertises X/Twitter, Facebook, and Instagram as "coming soon", but every selector and host permission in the codebase is LinkedIn-only.

A. Drop the platform pretence: rename project and copy to "LinkedIn Accessibility Checker".
B. Commit to a multi-platform plan: scope and schedule the other three platforms.
C. Leave the "coming soon" copy but rename the user-facing badge to "LinkedIn only".

Recommended option: A.

### Q60: SMACE overall verdict threshold, AA or AAA

- Status: open.
- Asked: 2026-05-23, by Tad in the SMACE backfill (work folder 012).

The extension currently uses WCAG 2.2 AA as the pass/fail line; the team's compliance baseline is AAA.

A. Raise the overall verdict to AAA.
B. Keep AA as the overall verdict; surface AAA gaps separately.
C. Two-tier verdict: AA pass/fail with an AAA score alongside.

Recommended option: C.

