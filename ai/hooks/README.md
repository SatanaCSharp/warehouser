# Agent hooks

Repository-owned scripts that an agent's runtime executes around it rather than instructions the
agent reads. Like everything else under `ai/`, these files are the canonical, agent-neutral source;
an agent's own settings file is an adapter that calls them and holds no rule of its own.

They come in three kinds:

- **Guards** run **before** a command and can refuse it — `deny-git-hook-bypass.sh`.
- **Briefings** run **before** an action and put a rule the agent is about to need into its context
  — `require-architecture-skill.sh`.
- **Upkeep** runs **around** the agent's work and maintains state the agent depends on —
  `sync-codegraph.sh`.

A script here exists when something in `AGENTS.md` needs to hold even when an agent is in a hurry,
is a different agent, or has compacted the instruction out of its context. Instructions an agent can
simply follow do not belong here — every hook costs a process.

## `deny-git-hook-bypass.sh`

Enforces `AGENTS.md` section **Committing**: every commit runs `.husky/pre-commit` (lint-staged:
`oxlint --type-aware --fix` then `oxlint --type-aware --max-warnings=0` over the staged files, then
`prettier --write`) and `.husky/commit-msg` (commitlint). The guard refuses a
command that would skip them:

- the bypass flags (`--no-verify`, `-n` on a commit, `--no-hooks`) on `commit`, `merge`, `rebase`,
  `cherry-pick`, `revert`, `am` or `push`;
- the husky escape hatches (`HUSKY=0`, `HUSKY_SKIP_HOOKS`) set for a git command;
- a hooks-path override, whether inline (`git -c core.hooksPath=…`) or persisted
  (`git config core.hooksPath …`).

Matching is per shell segment, so an unrelated command chained onto a plain commit is not a bypass
and a `grep` that merely mentions a flag is not one either. `ai/hooks/bypass-samples.tsv` is the
fixture that pins both directions — the refusals _and_ the ordinary commands that must keep
working. After any change to the pattern, run:

```sh
ai/hooks/check-bypass-samples.sh
```

The script itself is agent-neutral. `--check '<command>'` exits non-zero when a command line is a
bypass, which is the entry point for any agent, wrapper, or CI check; `--reason` prints the refusal
text; with no argument it speaks Claude Code's PreToolUse protocol on stdin/stdout.

If a hook fails, fix what it reports — a lint warning (fatal in every run: every `lint` script and
the hook alike pass `--max-warnings=0`), an architectural violation, a message commitlint refuses —
or tell the user. Never commit around it.

## `require-architecture-skill.sh`

Serves `AGENTS.md` section **Writing application code**, which requires production source under
`apps/web/src` and `apps/server/src` to be written with the governing `docs/system` documents
already in context, loaded through the
[`writing-app-code`](../skills/writing-app-code/SKILL.md) skill. Rather than trusting that an agent
read `AGENTS.md` — or still has it after a compaction, or was dispatched as a subagent with a narrow
brief — the hook fires on the edit itself and names the index that governs the file.

It **reminds; it does not refuse**. The hook can see the path being written but not the agent's
context, so it cannot tell a prepared edit from an unprepared one; blocking both would break the
prepared one for nothing. It returns the reminder as additional context on Claude Code's
`PreToolUse` surface for `Edit|Write`.

What is in scope is defined here and nowhere else:

- **gated** — anything under `apps/web/src/` or `apps/server/src/`;
- **not gated** — `*.spec.ts(x)`, `*.test.ts(x)`, `*.d.ts`, `apps/*/src/test/**`, `**/__tests__/**`,
  and every path outside those two source trees. Specs have their own owners
  (`guides/placing-web-tests.md`, `server-architecture.md` §testing); this gate is about production
  code.

To keep it from becoming noise it speaks **once per session per app** — the first web file and the
first server file each get a reminder, later edits in the same app are silent. The marker lives in
the run directory (`$TMPDIR`), never in the repository, so it cannot reach a commit and a lost
marker costs one extra reminder.

Agent-neutral entry points: `--check '<path>'` exits 0 and prints the reminder when the path is
gated production source and 1 when it is not, which is enough for any wrapper or CI check;
`--reason web|server|both` prints the text alone for another agent's adapter. Like the guard, it
needs `jq` or `python3` to read a hook payload and stays silent rather than interfering when neither
is installed.

## `sync-codegraph.sh`

Serves `AGENTS.md` section **Exploring code**, which requires `pnpm graph:status` to report
`Index is up to date` before a CodeGraph answer is trusted. Rather than leaving that to an agent
noticing, the script runs `pnpm graph:sync` at the two moments the index goes stale:

- **session start** — picks up everything that moved while the agent was away: a pull, a branch
  switch, a rebase, edits made outside the agent. ~1.3s on this repository, once per session.
- **after each `Edit`/`Write`** — `--background`, so the edit returns in milliseconds while the
  agent's own change is indexed before it queries the graph again.

It never fails its caller. A missing index, a missing install, a sync error — all exit 0; the worst
outcome is a stale index, which `pnpm graph:status` still reports honestly, whereas a loud failure
would block a session or an edit. It will not run `pnpm graph:init` on its own: building the ~90 MB
database is an explicit setup step, so with no index the session-start run prints a one-line
reminder and stops. Concurrent runs are single-flighted through a lock directory with a coalescing
rerun, because overlapping syncs contend for CodeGraph's own lock and can leave the stale one that
`pnpm graph unlock` exists to repair.

It goes through `pnpm graph:sync`, never `codegraph` directly — that script is what sets
`CODEGRAPH_TELEMETRY=0`, and this repository does not add telemetry.

Two gaps it does not close, both by design. Edits an agent makes through the shell rather than
through `Edit`/`Write` do not trigger it, and neither does a pull mid-session; `pnpm graph:status`
before trusting a graph answer remains the check. And it is deliberately **not** wired into
`.husky/pre-commit`: the commit hook is a correctness gate, a local search index is not a
correctness property, and paying seconds on every commit to maintain one would be the wrong cost at
the wrong moment.

## Installing

`.claude/` and other agent directories are gitignored, so each machine installs these hooks
itself.
`ai/commands/init-agent.md` and `ai/commands/update-agent.md` do it as part of installing an agent.
To do it by hand for Claude Code, merge the whole `hooks` block from
[`claude-code.settings.json`](claude-code.settings.json) into `.claude/settings.local.json`,
keeping the keys already there. It wires all four: `PreToolUse` on `Bash` for the guard,
`PreToolUse` on `Edit|Write` for the architecture briefing, and `SessionStart` plus `PostToolUse`
for the index sync.

For a target whose pre-command hook receives the command line as an argument or environment
variable rather than as JSON on stdin, call `deny-git-hook-bypass.sh --check "<command>"` and let a
non-zero exit refuse the call. For a target with no pre-command hook surface at all, the rule still
stands in `AGENTS.md`; report that it is unenforced rather than inventing a different mechanism.

`require-architecture-skill.sh` installs the same way on any pre-edit surface. Where a target hands
the hook a path instead of JSON, call `--check "<path>"` and surface the printed reminder when it
exits 0. Where a target has no pre-edit surface, the rule still stands in `AGENTS.md` and in the
skill's own description; report it as unenforced.

`sync-codegraph.sh` needs no payload at all — it reads nothing from stdin and takes only the
optional `--background` flag, so any session-start or post-edit hook surface can call it. A target
with neither surface keeps the index current by running `pnpm graph:sync` by hand before it
explores.

Two things are worth knowing before you debug a surprise:

- The guard reads the **command text**, so a command that merely contains an example of a bypass —
  writing documentation about it, grepping for it — can be refused. Write such content with the
  agent's file-writing tool instead of a shell heredoc.
- Reading the payload needs `jq` or `python3`. With neither installed the guard says so on stderr
  and lets the command through: blocking every shell command in the session would be worse than
  leaving one rule to the agent's own discipline.
