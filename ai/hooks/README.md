# Agent hooks

Repository-owned guards that a coding agent runs **before** it executes a command. Like everything
else under `ai/`, these files are the canonical, agent-neutral source; an agent's own settings file
is an adapter that calls them and holds no rule of its own.

A guard here exists when an instruction in `AGENTS.md` needs to hold even when an agent is in a
hurry, is a different agent, or has compacted the instruction out of its context. Instructions that
an agent can simply follow do not belong here — a guard costs a process per command.

## `deny-git-hook-bypass.sh`

Enforces `AGENTS.md` section **Committing**: every commit runs `.husky/pre-commit` (lint-staged,
`eslint <staged files> --max-warnings=0`) and `.husky/commit-msg` (commitlint). The guard refuses a
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

If a hook fails, fix what it reports — a warning `pnpm lint` tolerates but lint-staged does not, a
message commitlint refuses — or tell the user. Never commit around it.

## Installing

`.claude/` and other agent directories are gitignored, so each machine installs the guard itself.
`ai/commands/init-agent.md` and `ai/commands/update-agent.md` do it as part of installing an agent.
To do it by hand for Claude Code, merge the `hooks` block from
[`claude-code.settings.json`](claude-code.settings.json) into `.claude/settings.local.json`,
keeping the keys already there.

For a target whose pre-command hook receives the command line as an argument or environment
variable rather than as JSON on stdin, call `deny-git-hook-bypass.sh --check "<command>"` and let a
non-zero exit refuse the call. For a target with no pre-command hook surface at all, the rule still
stands in `AGENTS.md`; report that it is unenforced rather than inventing a different mechanism.

Two things are worth knowing before you debug a surprise:

- The guard reads the **command text**, so a command that merely contains an example of a bypass —
  writing documentation about it, grepping for it — can be refused. Write such content with the
  agent's file-writing tool instead of a shell heredoc.
- Reading the payload needs `jq` or `python3`. With neither installed the guard says so on stderr
  and lets the command through: blocking every shell command in the session would be worse than
  leaving one rule to the agent's own discipline.
