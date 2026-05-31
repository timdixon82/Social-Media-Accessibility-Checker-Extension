---
description: Sync CORE sections from the agent team template
allowed-tools: Read, Edit, Bash, Agent
---

Update this project's agent files with the latest CORE sections from the template repository.

1. If `scripts/sync-from-template.sh` exists, run it. Otherwise tell Tim that the sync script arrives in Stage 6 of the build, and stop.
2. The sync replaces only the content between the `<!-- BEGIN CORE -->` and `<!-- END CORE -->` markers in each agent file. It never touches the PROJECT OVERLAY section, so project-specific customisations are safe.
3. Show Tim a clear summary of what changed in each agent file.
4. Opening a pull request for the sync is a GitHub action: pre-approve it in the brief, or get Tim's approval at the time.
