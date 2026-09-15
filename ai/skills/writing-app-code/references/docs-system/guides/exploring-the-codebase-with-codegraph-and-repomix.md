# Exploring The Codebase With CodeGraph And Repomix

This guide applies to the whole repository — `apps/web`, `apps/server`, and every `packages/*`. It
states how a coding agent should locate code before reading it.

The default way to explore an unfamiliar repository — glob, grep, read whole files, repeat — spends
most of its context on implementation bodies that were never needed. Two tools replace that:

- **CodeGraph** indexes every symbol and every edge between symbols. It answers _where is this, who
  calls it, what breaks if I change it_ from a local database instead of from file reads.
- **Repomix** packs a directory into one compressed snapshot: the tree, plus each file's classes,
  functions, interfaces and types with their bodies removed.

Neither replaces reading the code. They decide **which lines to read**, so the read is a fragment
rather than a file. On `apps/server/src` a compressed snapshot is 166,940 tokens against 897,841 for
the same files packed whole — 81% less — and a full index of the repository (1,394 files, 18,565
symbols, 50,678 edges) rebuilds in under two seconds.

Both are ordinary root `devDependencies`. They are not installed globally, they are never invoked
against a path outside this repository, and everything they produce is machine-local and ignored by
git.

## 1. Setting it up

`pnpm install` installs both tools. One command builds the index:

```sh
pnpm graph:init
```

That writes `.codegraph/codegraph.db` (~90 MB) and is the only setup step. Repomix needs none — it
reads `repomix.config.jsonc` at the repository root and packs on demand.

| Command                 | What it does                                                            |
| ----------------------- | ----------------------------------------------------------------------- |
| `pnpm graph:init`       | Build the index from scratch. Run once after cloning.                   |
| `pnpm graph:sync`       | Re-index only what changed since the last run (§1.1).                   |
| `pnpm graph:status`     | Index freshness, file/symbol/edge counts, symbols by kind.              |
| `pnpm graph <command>`  | Any other CodeGraph command (§3), with telemetry disabled.              |
| `pnpm snapshot <paths>` | Pack those paths into `repomix-output.md` (§4).                         |
| `pnpm snapshot:tree`    | Print the repository's directory structure to stdout, no file contents. |

`pnpm graph:status` ending in `Index is up to date` is the precondition for every CodeGraph answer
below. A stale index answers confidently and wrongly — it reports symbols at line numbers that have
since moved. When a result does not match the file you open, run `pnpm graph:sync` and ask again.

### 1.1 Who runs `graph:sync`

For a coding agent, mostly its own runtime. `ai/hooks/sync-codegraph.sh` is installed into the
agent's hook surface by `ai/commands/init-agent.md` (see `ai/hooks/README.md`) and runs the sync at
the two moments the index goes stale:

- **at session start**, covering everything that moved while the agent was away — a pull, a branch
  switch, a rebase, edits made outside the agent. It costs ~1.3s, once.
- **after each file edit the agent makes through its editing tool**, in the background, so the
  agent's own change is indexed before its next query. The edit itself does not wait.

Two gaps remain, and `pnpm graph:status` is what closes them: an edit made through the shell rather
than through the editing tool does not trigger the hook, and neither does a pull performed
mid-session. Run `pnpm graph:sync` by hand in those cases — and always when a result does not match
the file you open.

Syncing is deliberately **not** wired into `.husky/pre-commit`. The commit hook is a correctness
gate; a local search index is not a correctness property, and adding seconds to every commit to
maintain one would be paying the wrong cost — at the moment you have finished exploring, not the
moment you are about to start.

### Telemetry is off, and must stay off

CodeGraph reports anonymous usage to its author by default. This repository does not add telemetry
(`AGENTS.md`), so every `graph*` script sets `CODEGRAPH_TELEMETRY=0`, which takes precedence over
any stored setting. Invoking `codegraph` directly bypasses that, so pass the variable yourself or go
through `pnpm graph …`. Do not "fix" a script by dropping the prefix.

Repomix sends nothing.

## 2. The order of operations

The point is to arrive at a line range. Work outside in and stop as soon as you have one:

1. **Locate the symbol.** `pnpm graph query <name>` — file and line, in one step, no reads.
2. **Read its shape and its neighbours.** `pnpm graph node <name>` — the signature, its members,
   its callers and callees. Often this is the entire answer.
3. **Read the fragment.** Open the file at the line the graph gave you, bounded — not the whole
   file, and never the whole directory.
4. **Snapshot only when the shape of a whole area is the question.** `pnpm snapshot <dir>` when you
   need to see how a module is laid out before choosing where a change goes.

Step 4 is last because it is the expensive one. A snapshot of `apps/server/src` still costs ~167k
tokens; a `graph node` answer costs a few hundred. Reach for the snapshot when the question is
"what is the structure of this module", not "where is this function".

The failure mode this ordering prevents is reading `apps/web/src/**` to find one hook. If you are
about to open a third file looking for the same symbol, stop and query the graph instead.

## 3. CodeGraph commands

| Command                           | Answers                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `pnpm graph query <name>`         | Where is this symbol? (fuzzy; `-k class`, `-l 20`, `-j`) |
| `pnpm graph node <name>`          | Its signature, members, callers and callees.             |
| `pnpm graph node -f <file>`       | A file's symbol map plus its dependents.                 |
| `pnpm graph callers <symbol>`     | Everything that calls it.                                |
| `pnpm graph callees <symbol>`     | Everything it calls.                                     |
| `pnpm graph impact <symbol>`      | Every symbol affected by changing it.                    |
| `pnpm graph affected <files...>`  | The test files a source change puts at risk.             |
| `pnpm graph files --filter <dir>` | The indexed file tree under a directory.                 |
| `pnpm graph explore <query...>`   | Relevant symbols' source plus call paths, in one shot.   |
| `pnpm graph context <task...>`    | A task-shaped bundle of symbols, relationships and code. |

`node` is the one to learn. It has two modes:

```sh
pnpm graph node SessionAuthGuard
```

returns the class, its members with signatures and line numbers, and a `Called by ←` trail naming
every file that reaches it — a structural outline, explicitly not the bodies. File mode reads a file
the way `Read` would, but with the symbol map and the dependent list attached:

```sh
pnpm graph node -f apps/server/src/shared/guards/session-auth.guard.ts --symbols-only
pnpm graph node -f apps/server/src/shared/guards/session-auth.guard.ts --offset 12 --limit 40
```

`--symbols-only` gives the map; `--offset`/`--limit` reads the fragment the map pointed at.

Two commands earn their place during a change rather than during exploration. `impact` is the
blast-radius question to ask **before** renaming or re-signing a shared symbol, and `affected` names
the tests a staged change should run — both answer from the graph, so neither costs a file read.

CodeGraph indexes what it can parse: TypeScript, TSX, JavaScript, YAML and Python here. It does not
index Markdown, so `docs/` is still searched with grep, and it says nothing about behaviour — a
symbol's existence is not proof that a rule in `docs/system` permits using it.

## 4. Repomix snapshots

```sh
pnpm snapshot apps/server/src/auth          # one module → repomix-output.md
pnpm snapshot apps/web/src/modules/warehouse --stdout   # straight to the agent, no file written
pnpm snapshot:tree                          # whole-repo tree only, ~19k tokens
```

`repomix.config.jsonc` sets the defaults, and each is a decision rather than a preference:
Markdown output, `compress: true` (Tree-sitter keeps declarations and drops bodies),
`showLineNumbers: true` (so a snapshot hands you the range to read next), comments kept (in this
repository they carry the rationale), and files ordered with the most-changed last.

Useful per-run overrides:

| Flag                      | When                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `--stdout`                | Feeding an agent directly; writes no file.                         |
| `--include "<globs>"`     | Narrow within a directory, e.g. `"**/*.controller.ts"`.            |
| `--remove-comments`       | A purely structural snapshot, where rationale is not the question. |
| `--no-compress`           | Bodies genuinely needed — but prefer reading the file.             |
| `--token-count-tree 1000` | Find what is actually costing context before packing it.           |
| `--token-budget <n>`      | Non-zero exit when the snapshot exceeds a context limit.           |

Scope the snapshot to a module. `pnpm snapshot` with no path packs everything and is almost never
the right call — the whole-repo structure is `pnpm snapshot:tree`, and it is two orders of magnitude
cheaper.

## 5. What must not end up in a snapshot

Repomix reads files; the repository's credentials policy governs which files may be read. Three
protections are in place and none of them is optional:

- `ignore.customPatterns` in `repomix.config.jsonc` excludes `**/.env` and `**/.env.*` before the
  packer opens them. `.env.example` is excluded too — read it directly when it is needed. It also
  excludes `**/*.pen`, which are encrypted and reachable only through the Pencil MCP server.
- `security.enableSecurityCheck` runs Secretlint over every packed file. Leave it on and never pass
  `--no-security-check`.
- `--no-gitignore` re-includes everything `.gitignore` excludes. Do not pass it.

`.codegraph/` and `repomix-output.*` are git-ignored. A snapshot is a generated artifact: do not
commit one, and do not check one into a feature directory as evidence — it goes stale the moment the
code moves, and regenerating it costs seconds.

## 6. What these tools do not own

They are search, not authority. A CodeGraph result tells you a symbol exists and who uses it; it
does not tell you whether using it is allowed. Placement, layering, dependency direction, error
handling, authorization and every other rule remain in `docs/system`, reached through
[the web index](../web-index.md) and [the server index](../server-index.md). Sibling code found via
`query` is not a rule, and a snapshot is not a substitute for reading the guide that governs the
change.

They also do not replace the repository's gates. `pnpm lint`, the package test suites and the
commit hook judge the code; `impact` and `affected` only tell you where to look first.
