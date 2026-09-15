#!/usr/bin/env sh
#
# Canonical reminder for AGENTS.md section "Writing application code": production source under
# apps/web/src and apps/server/src is written with the governing docs/system documents already in
# context, loaded through the writing-app-code skill.
#
# An agent that never read AGENTS.md, compacted it away, or was dispatched as a subagent with a
# narrow brief will otherwise edit a component or a use case from remembered conventions. This hook
# fires on the edit itself and names the index that governs the file, so the rule holds without
# depending on the agent's memory.
#
# It reminds; it does not refuse. Blocking every edit would break legitimate work the moment the
# skill is already loaded, and the hook cannot see an agent's context. To keep it from becoming
# noise it speaks once per session per app, and stays silent for every later edit in the same app.
#
# This file is the single definition of what is in scope. Each coding agent installs it into its own
# pre-edit hook surface (ai/hooks/README.md); the agent-specific settings are adapters that call
# this script and hold no rule of their own.
#
# Modes:
#   require-architecture-skill.sh                 Claude Code PreToolUse hook: reads the hook payload
#   require-architecture-skill.sh --claude-hook   on stdin and returns the reminder as additional
#                                                 context. Always exits 0.
#   require-architecture-skill.sh --check <path>  Agent-neutral: exit 0 and print the reminder when
#                                                 <path> is gated production source, exit 1 when it
#                                                 is not.
#   require-architecture-skill.sh --reason <app>  Print the reminder for `web`, `server` or `both`.
set -eu

SKILL='writing-app-code'

# Repo-relative path of the file being written, from an absolute or relative one.
relative_path() {
  repo_root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
  printf '%s' "${1#"$repo_root"/}"
}

# `web`, `server`, or empty when the path is not gated. Tests, type declarations and everything
# outside the two source trees are deliberately out of scope: specs are owned by
# guides/placing-web-tests.md and server-architecture.md section testing, not by this gate.
gated_app() {
  path=$(relative_path "$1")

  case "$path" in
    *.spec.ts | *.spec.tsx | *.test.ts | *.test.tsx | *.d.ts) return 0 ;;
    apps/web/src/test/* | apps/server/src/test/* | */__tests__/*) return 0 ;;
    apps/web/src/*) printf 'web' ;;
    apps/server/src/*) printf 'server' ;;
  esac
}

reminder_for() {
  case "$1" in
    web) index='docs/system/web-index.md' ;;
    server) index='docs/system/server-index.md' ;;
    both) index='docs/system/web-index.md and docs/system/server-index.md' ;;
    *) return 1 ;;
  esac

  printf '%s' "This file is production source gated by AGENTS.md section \"Writing application code\". Load the ${SKILL} skill before editing it: read ${index} in full, select the governing guides and Accepted ADRs for the paths you are touching (ai/skills/${SKILL}/references/), and read those documents in full. docs/system is the source of truth - sibling code is not a rule, and neither is what you remember about this repository."
}

# One reminder per writer per app, and never permanently.
#
# The marker is keyed on the session, the app, AND the agent making the call, because the agent that
# writes the file is often not the agent that read AGENTS.md. A delegated implementer runs inside the
# orchestrator's session: keyed on the session alone, the orchestrator's first web edit consumes the
# only reminder and the subagent - the one with a narrow brief and no AGENTS.md in context - is
# silenced for the rest of the run. That is precisely the agent this hook exists for.
#
# Not every runtime exposes an agent identifier, so the key degrades gracefully to `main` and a
# time-to-live backstops it: suppression expires after ARCH_REMINDER_TTL seconds (default 900) so a
# long implementation run is reminded again rather than once. The marker lives in the run directory
# rather than the repository so it never reaches a commit, and a lost marker costs one extra
# reminder.
ARCH_REMINDER_TTL=${WAREHOUSER_ARCH_REMINDER_TTL:-900}

# Epoch mtime of a file, on BSD (macOS) or GNU stat. Empty when neither answers.
file_mtime() {
  stat -f %m "$1" 2>/dev/null || stat -c %Y "$1" 2>/dev/null || printf ''
}

already_reminded() {
  session=${1:-unknown}
  app=$2
  agent=${3:-main}
  marker_dir="${TMPDIR:-/tmp}/warehouser-${SKILL}/${session}/${agent}"
  marker="${marker_dir}/${app}"

  if [ -e "$marker" ]; then
    mtime=$(file_mtime "$marker")
    now=$(date +%s 2>/dev/null || printf '')

    # Suppress only while the marker is inside the TTL. If either clock read fails, prefer the
    # reminder over the silence.
    if [ -n "$mtime" ] && [ -n "$now" ] && [ "$((now - mtime))" -lt "$ARCH_REMINDER_TTL" ]; then
      return 0
    fi
  fi

  mkdir -p "$marker_dir" 2>/dev/null || return 1
  : >"$marker" 2>/dev/null || return 1
  return 1
}

# Reading the payload needs a JSON parser; with neither installed the hook says so on stderr and
# stays silent rather than interfering with the session. The rule still stands in AGENTS.md.
payload_field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$2" | jq -r "$3 // \"\""
  elif command -v python3 >/dev/null 2>&1; then
    printf '%s' "$2" | python3 -c "$4"
  else
    printf '%s\n' 'require-architecture-skill: neither jq nor python3 found; reminder inactive' >&2
    printf ''
  fi
}

case "${1:-}" in
  --check)
    if [ "$#" -lt 2 ]; then
      printf '%s\n' 'usage: require-architecture-skill.sh --check <path>' >&2
      exit 2
    fi

    app=$(gated_app "$2")
    [ -n "$app" ] || exit 1
    reminder_for "$app"
    printf '\n'
    exit 0
    ;;
  --reason)
    if [ "$#" -lt 2 ]; then
      printf '%s\n' 'usage: require-architecture-skill.sh --reason <web|server|both>' >&2
      exit 2
    fi

    reminder_for "$2" || {
      printf '%s\n' 'require-architecture-skill.sh --reason takes web, server or both' >&2
      exit 2
    }
    printf '\n'
    exit 0
    ;;
  "" | --claude-hook) ;;
  *)
    printf '%s\n' "require-architecture-skill.sh: unknown argument '$1'" >&2
    exit 2
    ;;
esac

payload=$(cat)

file_path=$(payload_field path "$payload" '.tool_input.file_path' \
  'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))')
[ -n "$file_path" ] || exit 0

app=$(gated_app "$file_path")
[ -n "$app" ] || exit 0

session=$(payload_field session "$payload" '.session_id' \
  'import json,sys; print(json.load(sys.stdin).get("session_id",""))')

# Whichever subagent discriminator this runtime provides; `main` when it provides none. Sanitized
# because it becomes a path segment.
agent=$(payload_field agent "$payload" '(.agent_id // .agent_type // .subagent_type // "main")' \
  'import json,sys; d=json.load(sys.stdin); print(d.get("agent_id") or d.get("agent_type") or d.get("subagent_type") or "main")')
agent=$(printf '%s' "${agent:-main}" | tr -c 'A-Za-z0-9._-' '_')

already_reminded "$session" "$app" "$agent" && exit 0

reminder=$(reminder_for "$app")

if command -v python3 >/dev/null 2>&1; then
  printf '%s' "$reminder" | python3 -c 'import json,sys; print(json.dumps({"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":sys.stdin.read()}}))'
elif command -v jq >/dev/null 2>&1; then
  printf '%s' "$reminder" |
    jq -Rs '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:.}}'
fi

exit 0
