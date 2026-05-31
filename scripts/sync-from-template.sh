#!/usr/bin/env bash
# sync-from-template.sh: refresh this project's .claude/ configuration from
# the agent-team master template.
#
# What it syncs (in three passes):
#
#   Pass 1 — wholesale overwrite (no merging):
#     .claude/hooks/        — all hooks, including the safety gate
#     .claude/settings.json — permissions and hook registrations
#     .claude/commands/     — slash-command definitions
#
#   Pass 1b — scripts/ sync (verbatim overwrite):
#     scripts/next-q.sh           — question-numbering tool
#     scripts/sync-from-template.sh — this script (self-updating in project)
#
#   Pass 2 — CORE-section update (preserves PROJECT OVERLAY):
#     .claude/agents/*.md   — only the <!-- BEGIN CORE --> … <!-- END CORE -->
#                             block is replaced; the PROJECT OVERLAY section
#                             below it is never touched.
#
# What it never touches:
#   Agent PROJECT OVERLAY sections
#   docs/  (the project wiki)
#   CLAUDE.md, .gitignore, .editorconfig, VERSION, .github/
#
# After syncing it:
#   - Updates .claude/template-version with the master VERSION
#   - Stamps .claude/template-hook-sha256 with the sha256 of pre-tool-use.sh
#   - Runs the parity self-test (exits 1 on any failure)
#
# Usage:
#   bash scripts/sync-from-template.sh <path-to-master-template>

set -euo pipefail

# ── Locate helpers ────────────────────────────────────────────────────────────
# This script is deployed both to project repos (scripts/) and kept at the
# team root. The lib/parity.sh helper is available at the team root; project
# copies are standalone. Inline all helpers so the script is self-contained.

# ── Inline helpers (mirrors scripts/lib/parity.sh; kept in sync by sync-all) ─

validate_path() {
  local p="$1"
  case "$p" in /*) ;; *) return 1 ;; esac
  case "$p" in
    *[[:space:]]* | *'"'* | *'$'* | *'`'* | *';'*) return 1 ;;
  esac
  return 0
}

is_team_root() {
  local dir="$1"
  [ -f "$dir/CLAUDE.md" ] || return 1
  grep -qE '^# Claude Agent Team' "$dir/CLAUDE.md"
}

sha256_of() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | cut -d' ' -f1
  else
    shasum -a 256 "$file" | cut -d' ' -f1
  fi
}

run_parity_test() {
  local proj="$1"
  local master="$2"
  local fail=0
  local label
  label="$(basename "$proj")"

  local hook="$proj/.claude/hooks/pre-tool-use.sh"
  local master_hook="$master/.claude/hooks/pre-tool-use.sh"
  local settings="$proj/.claude/settings.json"
  local master_settings="$master/.claude/settings.json"

  if [ ! -f "$hook" ]; then
    echo "  FAIL [$label] pre-tool-use.sh missing"
    fail=1
  elif [ ! -x "$hook" ]; then
    echo "  FAIL [$label] pre-tool-use.sh not executable"
    fail=1
  fi

  if [ -f "$hook" ] && [ -f "$master_hook" ]; then
    if ! cmp -s "$hook" "$master_hook"; then
      echo "  FAIL [$label] pre-tool-use.sh differs from master (byte-for-byte)"
      fail=1
    fi
  fi

  if [ ! -f "$settings" ]; then
    echo "  FAIL [$label] settings.json missing"
    fail=1
  fi

  if [ -f "$settings" ] && [ -f "$master_settings" ]; then
    if ! cmp -s "$settings" "$master_settings"; then
      echo "  FAIL [$label] settings.json differs from master (byte-for-byte)"
      fail=1
    fi
  fi

  if [ -f "$settings" ]; then
    if ! grep -q '"PreToolUse"' "$settings"; then
      echo "  FAIL [$label] settings.json: no PreToolUse hook block"
      fail=1
    elif ! grep -q 'pre-tool-use\.sh' "$settings"; then
      echo "  FAIL [$label] settings.json: PreToolUse not pointing at pre-tool-use.sh"
      fail=1
    fi
    local banned
    banned="$(grep -E '"Bash\(git \*\)"|"Bash\(gh \*\)"|"Bash\(cd \*\)"|"Write\(/|"Edit\(/' \
               "$settings" 2>/dev/null || true)"
    if [ -n "$banned" ]; then
      echo "  FAIL [$label] settings.json allow-list contains banned entry: $banned"
      fail=1
    fi
  fi

  if [ -f "$hook" ] && [ -x "$hook" ]; then
    local deny_json
    deny_json='{"tool_name":"Bash","tool_input":{"command":"git push --force origin main"}}'
    local hook_out
    hook_out="$(printf '%s' "$deny_json" \
      | CLAUDE_PROJECT_DIR="$proj" bash "$hook" 2>/dev/null || true)"
    if ! printf '%s' "$hook_out" | grep -q '"permissionDecision":"deny"'; then
      echo "  FAIL [$label] copied hook did not deny synthetic 'git push --force'"
      fail=1
    fi
  fi

  if [ "$fail" -eq 0 ]; then
    echo "  PASS [$label] all 7 gate-integrity checks passed"
    return 0
  else
    return 1
  fi
}

# ── Arguments ──────────────────────────────────────────────────────────────────
#
# $1 (required) — path to the master template repository
# $2 (optional) — explicit project root; if omitted, inferred from script location.
#   Pass $2 when calling this script from an external wrapper (e.g. sync-all-projects.sh)
#   that lives outside the project directory tree.

template="${1:?Usage: bash scripts/sync-from-template.sh <path-to-master-template> [<project-root>]}"

if [ -n "${2:-}" ]; then
  project_root="$(cd "$2" && pwd)"
else
  project_root="$(cd "$(dirname "$0")/.." && pwd)"
fi

# Validate and verify the supplied master path
if ! validate_path "$template"; then
  echo "ERROR: master path contains invalid characters or is not absolute." >&2
  exit 1
fi

if [ ! -d "$template" ]; then
  echo "ERROR: master path does not exist: $template" >&2
  exit 1
fi

if ! is_team_root "$template"; then
  echo "ERROR: $template does not look like the agent-team master (CLAUDE.md H1 check failed)." >&2
  exit 1
fi

[ -d "$template/.claude/agents" ] || {
  echo "ERROR: no .claude/agents/ found in master: $template" >&2
  exit 1
}

# ── The sync manifests ────────────────────────────────────────────────────────
# Single source of truth for which paths are overwritten wholesale.
# Agents are NOT in SYNC_MANIFEST; they use CORE/OVERLAY handling in Pass 2.

SYNC_MANIFEST=(
  "hooks"
  "settings.json"
  "commands"
)

# Scripts that are synced verbatim from master's scripts/ to the project's
# scripts/ folder. These are standalone tools called directly by agents;
# syncing them ensures projects always run the latest version.
# sync-from-template.sh itself is included so the project's standalone copy
# stays current (note: updating the file on disk does not affect the running
# instance — bash loads the script once at start).

SCRIPTS_MANIFEST=(
  "scripts/next-q.sh"
  "scripts/sync-from-template.sh"
)

changed=0
echo "sync-from-template.sh: syncing $project_root from $template"
echo ""

# ── Pass 1: wholesale overwrite ───────────────────────────────────────────────

echo "Pass 1: wholesale sync of hooks/, settings.json, commands/"

for item in "${SYNC_MANIFEST[@]}"; do
  src="$template/.claude/$item"
  dst="$project_root/.claude/$item"

  if [ ! -e "$src" ]; then
    echo "  WARNING: $src not found in master; skipping"
    continue
  fi

  # Compare before overwriting so we can report accurately
  if [ -e "$dst" ]; then
    # For directories, diff recursively to detect changes
    if [ -d "$dst" ] && diff -rq "$src" "$dst" >/dev/null 2>&1; then
      echo "  unchanged: .claude/$item"
      continue
    elif [ -f "$dst" ] && cmp -s "$src" "$dst"; then
      echo "  unchanged: .claude/$item"
      continue
    fi
  fi

  rm -rf "$dst"
  cp -R "$src" "$dst"
  echo "  synced:    .claude/$item"
  changed=$((changed + 1))
done

# Ensure all hooks are executable after copy
if [ -d "$project_root/.claude/hooks" ]; then
  find "$project_root/.claude/hooks" -type f -name "*.sh" -exec chmod +x {} \;
fi

# ── Pass 1b: scripts/ sync ────────────────────────────────────────────────────

echo ""
echo "Pass 1b: scripts/ sync"

for item in "${SCRIPTS_MANIFEST[@]}"; do
  src="$template/$item"
  dst="$project_root/$item"

  if [ ! -f "$src" ]; then
    echo "  WARNING: $src not found in master; skipping"
    continue
  fi

  # Create the destination directory if it does not yet exist.
  dst_dir="$(dirname "$dst")"
  mkdir -p "$dst_dir"

  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then
    echo "  unchanged: $item"
    continue
  fi

  cp "$src" "$dst"
  chmod +x "$dst"
  echo "  synced:    $item"
  changed=$((changed + 1))
done

# ── Pass 2: agent CORE sections ───────────────────────────────────────────────

echo ""
echo "Pass 2: agent CORE sections"

for tfile in "$template"/.claude/agents/*.md; do
  [ -f "$tfile" ] || continue
  name="$(basename "$tfile")"
  pfile="$project_root/.claude/agents/$name"

  if [ ! -f "$pfile" ]; then
    echo "  NEW in master, not yet in this project: $name (skipping)"
    continue
  fi

  core_file="$(mktemp)"
  awk '/<!-- BEGIN CORE -->/{f=1} f{print} /<!-- END CORE -->/{f=0}' "$tfile" > "$core_file"
  if [ ! -s "$core_file" ]; then
    rm -f "$core_file"
    echo "  WARNING: no CORE block in $name; skipping"
    continue
  fi

  # Write the CORE block to a temp file and read it back with getline.
  # Passing a multi-line string via awk -v fails on macOS awk (BSD awk).
  tmp="$(mktemp)"
  awk -v cfile="$core_file" '
    /<!-- BEGIN CORE -->/ {
      while ((getline line < cfile) > 0) print line
      skip=1; next
    }
    skip && /<!-- END CORE -->/ {skip=0; next}
    !skip {print}
  ' "$pfile" > "$tmp"
  rm -f "$core_file"

  if cmp -s "$pfile" "$tmp"; then
    rm -f "$tmp"
    echo "  unchanged: .claude/agents/$name"
  else
    mv "$tmp" "$pfile"
    echo "  updated:   .claude/agents/$name (CORE replaced, OVERLAY preserved)"
    changed=$((changed + 1))
  fi
done

# ── Update stamps ─────────────────────────────────────────────────────────────
# Write stamps only when their content actually changes, so a no-op sync does
# not leave the repo with uncommitted tracked changes (which would block the
# next sync run).

master_version="$(cat "$template/VERSION" 2>/dev/null || echo unknown)"

prev_version="$(cat "$project_root/.claude/template-version" 2>/dev/null || echo unknown)"
if [ "$prev_version" != "$master_version" ]; then
  printf '%s\n' "$master_version" > "$project_root/.claude/template-version"
  echo ""
  echo "  template-version: $prev_version → $master_version"
  changed=$((changed + 1))
fi

# Stamp sha256 of the newly-synced pre-tool-use.sh — only if changed.
hook_path="$project_root/.claude/hooks/pre-tool-use.sh"
if [ -f "$hook_path" ]; then
  hook_sha="$(sha256_of "$hook_path")"
  sha_file="$project_root/.claude/template-hook-sha256"
  prev_sha="$(cat "$sha_file" 2>/dev/null | tr -d '[:space:]' || echo '')"
  if [ "$prev_sha" != "$hook_sha" ]; then
    printf '%s\n' "$hook_sha" > "$sha_file"
    echo "  template-hook-sha256: $hook_sha"
    changed=$((changed + 1))
  fi
fi

# ── Parity self-test ──────────────────────────────────────────────────────────

echo ""
echo "Running parity self-test..."
echo ""

if run_parity_test "$project_root" "$template"; then
  echo ""
  echo "Sync complete. $changed item(s) changed."
  echo "  PROJECT OVERLAY sections in agent files were not touched."
  echo "  docs/ wiki was not touched."
  echo ""
  echo "Review the changes, then open a pull request."
  echo "Opening a pull request is a gated action — pause for Tim's approval."
else
  echo "" >&2
  echo "ERROR: parity self-test failed after sync." >&2
  echo "       Resolve the FAIL items above before opening a pull request." >&2
  exit 1
fi
