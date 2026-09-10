#!/usr/bin/env sh
#
# Canonical guard for AGENTS.md section "Committing": every commit runs the repository's Git hooks.
#
# `.husky/pre-commit` runs lint-staged (`eslint <staged files> --max-warnings=0`, a stricter bar
# than `pnpm lint`, which exits 0 on warnings) and `.husky/commit-msg` runs commitlint. A commit
# that skips them puts a warning-level rule violation, or a message commitlint would have refused,
# on a branch with nothing left to catch it — so a bypass is refused here rather than discouraged.
#
# This file is the single definition of what counts as a bypass. Each coding agent installs it into
# its own pre-command hook surface (ai/hooks/README.md); the agent-specific settings are adapters
# that call this script and hold no rule of their own.
#
# Modes:
#   deny-git-hook-bypass.sh                  Claude Code PreToolUse hook: reads the hook payload on
#   deny-git-hook-bypass.sh --claude-hook    stdin and emits a deny decision when the command
#                                            bypasses the hooks. Always exits 0.
#   deny-git-hook-bypass.sh --check '<cmd>'  Agent-neutral: exit 1 with the reason on stderr when
#                                            <cmd> bypasses the hooks, exit 0 when it does not.
#   deny-git-hook-bypass.sh --reason         Print the refusal text, for another agent's adapter.
set -eu

# Matched per shell segment (`[^;&|]*` never crosses `;`, `&&` or `|`), so an unrelated command
# chained onto a git command cannot trip it: an `echo -n` before a plain commit is not a bypass,
# while a `cd` before a bypassing commit still is. A bare `-n` counts only in the same segment as
# `commit`, where it is git's own spelling of the flag.
BYPASS_PATTERN='git[^;&|]*(commit|merge|rebase|cherry-pick|revert|am|push)[^;&|]*(--no-verify|--no-hooks)|git[^;&|]*commit[^;&|]*[[:space:]]-n([[:space:]]|$)|(HUSKY=0|HUSKY_SKIP_HOOKS)[^;&|]*git|git[^;&|]*core\.hooksPath'

REASON='Blocked: this command skips the repository Git hooks. AGENTS.md section Committing requires every commit to run .husky/pre-commit (lint-staged, eslint --max-warnings=0) and .husky/commit-msg (commitlint). Remove the bypass flag, environment variable or hooks-path override and commit again; if a hook fails, fix what it reports or tell the user - never commit around it.'

bypasses_hooks() {
  printf '%s' "$1" | grep -Eq "$BYPASS_PATTERN"
}

# The command line out of a hook payload. Reading it needs a JSON parser; when the machine has
# neither, the guard says so on stderr and lets the call through rather than blocking every shell
# command in the session — the rule still stands in AGENTS.md, it is only unenforced here.
command_from_payload() {
  payload=$(cat)

  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$payload" | jq -r '.tool_input.command // ""'
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$payload" |
      python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))'
  else
    printf '%s\n' 'deny-git-hook-bypass: neither jq nor python3 found; guard inactive' >&2
    printf ''
  fi
}

case "${1:-}" in
  --check)
    if [ "$#" -lt 2 ]; then
      printf '%s\n' 'usage: deny-git-hook-bypass.sh --check <command>' >&2
      exit 2
    fi

    if bypasses_hooks "$2"; then
      printf '%s\n' "$REASON" >&2
      exit 1
    fi

    exit 0
    ;;
  --reason)
    printf '%s\n' "$REASON"
    exit 0
    ;;
  '' | --claude-hook)
    invoked=$(command_from_payload)

    if [ -n "$invoked" ] && bypasses_hooks "$invoked"; then
      printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"%s"}}' "$REASON"
    fi

    exit 0
    ;;
  *)
    printf '%s\n' "deny-git-hook-bypass.sh: unknown option ${1}" >&2
    exit 2
    ;;
esac
