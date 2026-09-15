# Codebase exploration

Locate code before reading it. Two project-local indexes answer the questions that would otherwise
cost a directory walk: **CodeGraph** holds every symbol and the edges between them, **Repomix** packs
a directory into one compressed snapshot of declarations without bodies. The procedure is
[`docs/system/guides/exploring-the-codebase-with-codegraph-and-repomix.md`](../../../docs/system/guides/exploring-the-codebase-with-codegraph-and-repomix.md);
this fragment is the rule, that guide is the command reference.

Work outside in, and stop at the first step that answers the question:

1. `pnpm graph query <symbol>` — where it is defined, as `file:line`.
2. `pnpm graph node <symbol>` — its signature, members, callers and callees. `pnpm graph callers`,
   `callees` and `impact` extend the same trail; `pnpm graph affected <files>` names the tests a
   source change puts at risk.
3. Read the file at that line, bounded to the range you need.
4. `pnpm snapshot <dir>` only when the layout of a whole area is the question.

Glob-then-grep-then-read-whole-files is no longer the default. Grep over source is the fallback for
what the graph cannot answer — an unindexed file type, a string rather than a symbol, an index that
is stale and cannot be synced. Markdown is not indexed, so `docs/` and `ai/` are still grepped.

Before trusting an answer, `pnpm graph:status` must say `Index is up to date`; a stale index cites
line numbers that have moved, and cites them confidently. `pnpm graph:sync` fixes it. Reach the tool
through the `pnpm graph*` scripts, never as a bare `codegraph` — the scripts disable its telemetry.

An agent that cites `file:line` from the graph must have opened the file to confirm the claim it
makes about the code. The graph proves a symbol exists and who reaches it; it proves nothing about
behaviour, and nothing about whether a rule in `docs/system` permits the use.
