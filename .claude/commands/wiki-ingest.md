---
description: Run a wiki ingest pass
argument-hint: [topic or work folder]
allowed-tools: Read, Write, Edit, Glob, Grep
---

Run a wiki ingest, integrating something the team has learned.

1. Take the topic or work folder from `$ARGUMENTS`.
2. Decide whether the learning is project-specific or cross-cutting. The default is project-specific. A cross-cutting learning is one that any future project would also benefit from.
3. Write the learning into the relevant wiki tier: the project wiki for a project-specific learning, and both the project wiki and the global wiki for a cross-cutting learning.
4. A single ingest may touch several pages: a standards page, the glossary, the index, and the log. Update every page that applies.
5. Append a log entry in the form `## [YYYY-MM-DD] ingest | <subject>`. For a cross-cutting ingest, write a paired entry in each tier's log, each one citing the other.
6. Tell Tim which tier or tiers you wrote to, and why.
