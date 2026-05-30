#!/usr/bin/env bash
# stop.sh: fires on the Stop event (end of a Sonja orchestration turn).
#
# Appends one orchestration entry to usage.md with the turn's token count
# from the hook metadata, and one event line to the current work folder's
# events.jsonl via the shared helper.
#
# Safe by default: any failure in reading metadata or writing to usage.md
# is silently skipped; the turn is never failed by this hook. No set -e.

input=$(cat)

# Extract token count from the stop event metadata. The field path may vary
# by Claude Code version; fall back gracefully if absent.
token_count=$(printf '%s' "$input" \
  | jq -r '.usage.total_tokens // .token_count // .tokens // ""' 2>/dev/null) || token_count=""

# Append to usage.md if we have a figure and the file exists.
usage_file="$CLAUDE_PROJECT_DIR/usage.md"
if [ -n "$token_count" ] && [ -f "$usage_file" ]; then
  ts=$(date '+%Y-%m-%d %H:%M:%S')
  printf -- '- [%s] Sonja orchestration turn: %s tokens.\n' \
    "$ts" "$token_count" >> "$usage_file" 2>/dev/null || true
fi

# Append to events.jsonl in the current work folder.
lib="$CLAUDE_PROJECT_DIR/.claude/hooks/_lib/events.sh"
if [ -f "$lib" ]; then
  # shellcheck source=/dev/null
  source "$lib"
  append_event "Sonja" "Stop" "orchestration-turn" "" "" "$token_count" ""
fi

# Trigger a full rebuild of usage.md from all events.jsonl files so the
# ledger is always fresh after each Sonja turn. Run in background; any
# failure is silently discarded so the turn is never blocked.
usage_script="$CLAUDE_PROJECT_DIR/scripts/usage.sh"
if [ -f "$usage_script" ] && [ -x "$usage_script" ]; then
  "$usage_script" >/dev/null 2>&1 &
fi

exit 0
