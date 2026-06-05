#!/usr/bin/env bash
# delete-merged-branches.sh
# Deletes remote branches that have been merged into main.
# Skips: main, and any branch matching "release-please*".
# Run this script yourself — the agent team's deny-list prevents agents from
# deleting branches directly.
#
# Usage:
#   bash scripts/delete-merged-branches.sh           # dry run (preview only)
#   bash scripts/delete-merged-branches.sh --confirm # actually delete

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=true

if [[ "${1:-}" == "--confirm" ]]; then
  DRY_RUN=false
fi

echo "Fetching latest branch list from origin..."
git -C "$REPO_DIR" fetch --prune origin

MERGED=$(git -C "$REPO_DIR" branch -r --merged origin/main \
  | grep -v 'origin/main' \
  | grep -v 'origin/HEAD' \
  | grep -v 'origin/release-please' \
  | sed 's|origin/||' \
  | sed 's/^[[:space:]]*//')

if [[ -z "$MERGED" ]]; then
  echo "No merged branches to delete."
  exit 0
fi

echo ""
if $DRY_RUN; then
  echo "DRY RUN — branches that would be deleted (re-run with --confirm to delete):"
else
  echo "Deleting merged branches from origin:"
fi
echo ""

while IFS= read -r branch; do
  if $DRY_RUN; then
    echo "  would delete: $branch"
  else
    git -C "$REPO_DIR" push origin --delete "$branch"
    echo "  deleted: $branch"
  fi
done <<< "$MERGED"

echo ""
if $DRY_RUN; then
  echo "Run with --confirm to delete the branches listed above."
else
  echo "Done. Run 'git fetch --prune origin' to update your local remote-tracking refs."
fi
