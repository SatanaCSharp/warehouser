#!/usr/bin/env bash
#
# Keeps the CodeGraph index current so an agent's `pnpm graph …` answers describe the tree as it is
# now, not as it was when the index was last built. A stale index is the one failure mode the
# exploration workflow cannot detect on its own: it reports symbols at line numbers that have since
# moved, and it does so confidently.
#
# Two callers, both wired in `claude-code.settings.json`:
#
#   SessionStart   — sync once before the agent explores anything. This is the moment the guide
#                    ("Exploring the codebase with CodeGraph and Repomix") says to sync, and it
#                    covers everything that moved since the last session: a pull, a branch switch,
#                    a rebase, or edits made outside the agent.
#   PostToolUse    — `--background` after each Edit/Write, so the agent's own changes are indexed
#                    before it queries the graph again.
#
# It is deliberately *not* wired into `.husky/pre-commit`. The commit hook is a correctness gate; a
# local search index is not a correctness property, and paying seconds on every commit to maintain
# one would be the wrong cost at the wrong moment.
#
# Never fails a caller. A missing index, a missing install, a sync error — all exit 0. The worst
# outcome of this script not running is a stale index, which `pnpm graph:status` still reports
# honestly; the worst outcome of it failing loudly would be a blocked session or a blocked edit.

set -u

project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$project_dir" || exit 0

background=0
[ "${1:-}" = "--background" ] && background=1

# `pnpm graph:init` is an explicit setup step (~90 MB of database), never something a hook decides
# to do on its own. Without an index there is nothing to sync — say so once, at session start, where
# the message reaches the agent as context, and stay silent everywhere else.
if [ ! -f .codegraph/codegraph.db ]; then
  [ "$background" -eq 0 ] &&
    echo "CodeGraph index not found. Run \`pnpm graph:init\` before relying on \`pnpm graph …\`."
  exit 0
fi

# Re-exec detached so an Edit/Write returns immediately. The sync costs ~0.5s on a no-op, which is
# cheap but not free, and nothing downstream of the edit needs to wait for it.
if [ "$background" -eq 1 ]; then
  ("$0" >/dev/null 2>&1 &)
  exit 0
fi

# Single-flight with a coalescing rerun. `mkdir` is the atomic test-and-set. Concurrent syncs would
# contend for CodeGraph's own lock file and can leave a stale one behind — the failure `codegraph
# unlock` exists to repair — so a second caller does not wait: it flags a rerun and returns, and the
# in-flight sync loops once more to pick up whatever arrived while it was working.
lock_dir=.codegraph/.hook-sync.lock
if ! mkdir "$lock_dir" 2>/dev/null; then
  : >"$lock_dir/rerun" 2>/dev/null
  exit 0
fi
trap 'rm -rf "$lock_dir"' EXIT

# Through `pnpm graph:sync`, never `codegraph` directly: the script is what sets
# CODEGRAPH_TELEMETRY=0, and this repository does not add telemetry (AGENTS.md).
while :; do
  rm -f "$lock_dir/rerun"
  pnpm graph:sync --quiet >/dev/null 2>&1 || break
  [ -e "$lock_dir/rerun" ] || break
done

exit 0
