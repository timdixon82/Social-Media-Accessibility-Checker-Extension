---
description: Write a structured session summary to the current work folder so the next session can pick up where this one left off
argument-hint: [optional note]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

Write a structured session summary to the current work folder's log.md. The summary captures enough context that a fresh session can resume without re-reading the full conversation transcript.

1. Read `.claude/work/.current` to find the current work folder id.

2. Read the current work folder's `brief.md` to confirm the active work and routing plan.

3. Gather the following information:
   - The last message Tim sent (from `.claude/transcripts/` if the file exists, or from the current conversation).
   - Any open subagent dispatches or agents currently in flight (check the work folder's `log.md` for recent subagent-stop entries).
   - All open pull requests relevant to this work folder (run `gh pr list --state open` if the GitHub CLI is available).
   - Any unresolved items: open questions in `outputs/questions.md` that are relevant to this work folder, and any items in the work folder's brief that are not yet done.

4. Write the summary as a new entry in the current work folder's `log.md`, using this format:

   ```
   ## [YYYY-MM-DD] session-summary | compact for session handoff

   ### Last user message

   <quote or paraphrase of Tim's last message in this session>

   ### Open agents

   <list of agents currently dispatched and their status, or "None.">

   ### Open pull requests

   <list of open PRs with number, title, and branch name, or "None.">

   ### Unresolved items

   <numbered list of open questions (Q-numbers), open brief items not yet done,
   and any other unresolved dependency, or "None.">

   ### Next step

   <one sentence: what the next session should do first>
   ```

5. Print the path to the log entry and confirm the summary is written. A fresh session reads this entry first, then the wiki, to restore context in a fraction of the token cost of re-reading the full transcript.

If `$ARGUMENTS` contains a note, append it as a "### Notes" section below "Next step".
