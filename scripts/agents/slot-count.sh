#!/usr/bin/env bash
#
# slot-count.sh — print the number of active feat/* worktree slots.
#
# Active slot = branch that appears in EITHER:
#   - an open PR with head = feat/*  (worktree may already be cleaned up)
#   - a git worktree feat/* with a matching live screen session
# (UNION — covers every phase of the worker lifecycle.)
#
# Usage:
#   ./scripts/agents/slot-count.sh
#   output: single integer on stdout
#
# Env:
#   REPO_DIR    path to the main git repo (default: /home/developer/artisan-mvp-temp)
#   SLOT_CAP    capacity ceiling (default: 4) — exported for callers; not used here
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_DIR="${REPO_DIR:-/home/developer/artisan-mvp-temp}"
export SLOT_CAP="${SLOT_CAP:-4}"

declare -A seen

# Branch 1: open feat/* PRs (base=staging)
while IFS= read -r branch; do
  [[ "$branch" == feat/* ]] && seen["$branch"]=1
done < <(gh pr list --base staging --state open --json headRefName \
    --jq '.[].headRefName' 2>/dev/null || true)

# Branch 2: worktrees by PATH (robust to detached HEAD during rebase)
# Any worktree with path /tmp/wt-* is an active worker slot
WORKTREE_BASE="${WORKTREE_BASE:-/tmp/wt-}"
while IFS= read -r wt_path wt_detached_or_branch; do
  # Extract path from worktree list line
  [[ -z "$wt_path" ]] && continue

  # Only count worktrees in /tmp/wt-* (skip main repo and others)
  [[ "$wt_path" != ${WORKTREE_BASE}* ]] && continue
  [[ "$wt_path" == "$REPO_DIR" ]] && continue

  # Derive session name from directory name (wt-<session> -> <session>)
  session="${wt_path##*/}"  # basename
  session="${session#wt-}"   # remove 'wt-' prefix

  # Use the derived session to construct branch key for seen[]
  # This works whether the worktree is on feat/session or detached HEAD
  branch="feat/${session}"

  # Check if screen session is live
  screen -ls 2>/dev/null | grep -qE "[0-9]+\\.${session}[[:space:]]" \
    && seen["$branch"]=1 || true
done < <(git -C "$REPO_DIR" worktree list 2>/dev/null | awk '{print $1}' || true)

echo "${#seen[@]}"
