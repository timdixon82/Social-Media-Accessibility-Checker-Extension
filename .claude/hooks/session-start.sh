#!/usr/bin/env bash
# session-start.sh: prints a short context summary when a session begins:
# the project, work folders touched in the last 7 days, and the wiki status.

cat > /dev/null  # consume and ignore the SessionStart JSON on stdin

proj="$CLAUDE_PROJECT_DIR"
echo "Agent team session. Project: $(basename "$proj")."

# Sync check: scoped to THIS session's active project only.
#
# If this session is inside a scaffolded or isolated project (it carries a
# .claude/template-version stamp), compare only this project against the
# team template master and tell Sonja whether a sync is due for it.
# This never syncs any other project; sync-all-projects.sh is the deliberate
# team-root action for that. The hook never edits files; it only surfaces
# the prompt so Sonja can ask Tim at the top of the session.
#
# Master location uses 4-layer resolution:
#   1. $AGENTTEAM_MASTER env var
#   2. Validated .claude/template-master stamp (must be absolute, no bad chars,
#      must be an existing dir whose CLAUDE.md H1 names "Claude Agent Team")
#   3. Sibling probe: <project_parent>/AgentTeam
#   4. Hard-coded default /Users/timdixon/Code/AgentTeam
#
# Jed security finding 3: template-master path is validated; if the resolved
# master is not an existing directory, print "master path invalid" instead of
# emitting a command that interpolates an unvalidated path.
#
# Jacob finding 4: distinguish "MASTER UNREACHABLE" from "in sync".
# Jacob finding 2: check sha256 parity of pre-tool-use.sh, not just version.

_session_validate_path() {
  # Returns 0 for a safe absolute path; 1 otherwise.
  local p="$1"
  case "$p" in /*) ;; *) return 1 ;; esac
  case "$p" in *[[:space:]]* | *'"'* | *'$'* | *'`'* | *';'*) return 1 ;; esac
  return 0
}

_session_is_team_root() {
  local dir="$1"
  [ -f "$dir/CLAUDE.md" ] || return 1
  grep -qE '^# Claude Agent Team' "$dir/CLAUDE.md"
}

tv_file="$proj/.claude/template-version"
if [ -f "$tv_file" ]; then

  # ── Layer 1: environment variable ─────────────────────────────────────────
  master=""
  if [ -n "${AGENTTEAM_MASTER:-}" ]; then
    if _session_validate_path "$AGENTTEAM_MASTER" \
        && [ -d "$AGENTTEAM_MASTER" ] \
        && _session_is_team_root "$AGENTTEAM_MASTER"; then
      master="$AGENTTEAM_MASTER"
    fi
  fi

  # ── Layer 2: template-master stamp ────────────────────────────────────────
  if [ -z "$master" ] && [ -f "$proj/.claude/template-master" ]; then
    raw="$(tr -d '\n\r' < "$proj/.claude/template-master")"
    if _session_validate_path "$raw" && [ -d "$raw" ] && _session_is_team_root "$raw"; then
      master="$raw"
    fi
  fi

  # ── Layer 3: sibling probe ─────────────────────────────────────────────────
  if [ -z "$master" ]; then
    parent="$(cd "$proj/.." 2>/dev/null && pwd)" || parent=""
    if [ -n "$parent" ]; then
      sibling="$parent/AgentTeam"
      if [ -d "$sibling" ] && _session_is_team_root "$sibling"; then
        master="$sibling"
      fi
    fi
  fi

  # ── Layer 4: hard-coded default ───────────────────────────────────────────
  [ -z "$master" ] && master="/Users/timdixon/Code/AgentTeam"

  # ── Check master is a valid existing directory ────────────────────────────
  if [ ! -d "$master" ]; then
    echo "master path invalid, skipping sync check."
  else
    proj_v="$(cat "$tv_file" 2>/dev/null || echo unknown)"
    master_v="$(cat "$master/VERSION" 2>/dev/null || true)"

    if [ -z "$master_v" ]; then
      echo "MASTER UNREACHABLE: cannot read VERSION from $master."
    elif [ "$proj_v" = "unknown" ]; then
      echo "MASTER UNREACHABLE: cannot read template-version from $tv_file."
    elif [ "$proj_v" != "$master_v" ]; then
      echo "SYNC DUE: this project was scaffolded from template $proj_v; master is now $master_v."
      echo "  Run: bash scripts/sync-from-template.sh \"$master\""
    else
      echo "Template: in sync ($proj_v)."
    fi

    # ── sha256 parity check: detect silent local modification of the gate ───
    sha_file="$proj/.claude/template-hook-sha256"
    if [ -f "$sha_file" ]; then
      expected_sha="$(tr -d '\n\r' < "$sha_file")"
      chook="$proj/.claude/hooks/pre-tool-use.sh"
      if [ -f "$chook" ] && [ -n "$expected_sha" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
          actual_sha="$(sha256sum "$chook" | cut -d' ' -f1)"
        else
          actual_sha="$(shasum -a 256 "$chook" | cut -d' ' -f1)"
        fi
        if [ "$actual_sha" != "$expected_sha" ]; then
          echo "WARNING: safety hook sha256 mismatch — pre-tool-use.sh may have been locally modified."
          echo "  Expected: $expected_sha"
          echo "  Actual:   $actual_sha"
          echo "  Run: bash scripts/sync-from-template.sh \"$master\" to restore byte parity."
        fi
      fi
    fi
  fi

fi

work_dir="$proj/.claude/work"
if [ -d "$work_dir" ]; then
  recent=$(find "$work_dir" -mindepth 1 -maxdepth 1 -type d -mtime -7 2>/dev/null)
  if [ -n "$recent" ]; then
    echo "Work folders active in the last 7 days:"
    while IFS= read -r d; do
      [ -n "$d" ] && echo "  - $(basename "$d")"
    done <<< "$recent"
  else
    echo "No work folders active in the last 7 days."
  fi
else
  echo "No work folders yet."
fi

log="$proj/docs/log.md"
if [ -f "$log" ]; then
  last=$(grep -E '^## \[' "$log" 2>/dev/null | tail -1)
  [ -n "$last" ] && echo "Global wiki, last operation: ${last#'## '}"
fi

# Print the next free Q-number so Sonja always sees it at session start
# and cannot assign a low or stale number by accident.
next_q_script="$proj/scripts/next-q.sh"
if [ -f "$next_q_script" ] && [ -x "$next_q_script" ]; then
  next_q=$(bash "$next_q_script" 2>/dev/null)
  [ -n "$next_q" ] && echo "Next free Q-number: $next_q"
fi

# Refresh outputs/status.html so Tim always sees a current dashboard at
# session open. Run the script only if it exists and is executable.
# Any failure is silently discarded; the session is never blocked.
status_script="$proj/scripts/status.sh"
if [ -f "$status_script" ] && [ -x "$status_script" ]; then
  "$status_script" >/dev/null 2>&1 || true
fi

exit 0
