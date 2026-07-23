---
description: Sync CORE sections from the agent team template
allowed-tools: Read, Edit, Bash, Agent
---

Update this project's agent files with the latest CORE sections from the template repository.

1. Always do the sync on one stable branch: `chore/template-sync`. Never name the branch after the template version, and never invent a new name per run. If the branch already exists, check it out and reuse it; if not, create it. One stable branch means each repository holds at most one sync branch at a time, and a new sync updates the existing pull request instead of leaving a trail of version-named branches behind. This is a deliberate anti-clutter rule; see `docs/release-process.md` under "Post-merge branch cleanup" for why.
2. If `scripts/sync-from-template.sh` exists, run it. Otherwise tell Tim that the sync script arrives in Stage 6 of the build, and stop.
3. The sync replaces only the content between the `<!-- BEGIN CORE -->` and `<!-- END CORE -->` markers in each agent file. It never touches the PROJECT OVERLAY section, so project-specific customisations are safe.
4. Show Tim a clear summary of what changed in each agent file.
5. Open or update the pull request from `chore/template-sync`. If an open sync pull request already exists, push to its branch so it updates in place rather than opening a second one. Opening a pull request is a GitHub action: pre-approve it in the brief, or get Tim's approval at the time.
