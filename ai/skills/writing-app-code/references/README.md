# References — what is generated here, and what is written

## `docs-system/` — generated, never edit

A byte-for-byte mirror of the repository's `docs/system` directory, produced by
[`../scripts/sync-references.sh`](../scripts/sync-references.sh).

`docs/system` is the source of truth (`AGENTS.md`). The mirror exists for one reason: an installed
copy of this skill — in `.claude/skills/`, `.codex/skills/`, a worktree, or a subagent with a narrow
tool set — must carry the same instructions the repository does, not a summary of them. Nothing here
is a second version of a rule; it is the same bytes in a second place.

Consequences of that:

- **Never edit a file under `docs-system/`.** A fix goes into `docs/system/<path>`, then the sync
  copies it here. An edit made here is silently reverted by the next sync, and until then it is a
  lie with a plausible path.
- **When the mirror and `docs/system` disagree, `docs/system` wins.** The mirror is stale; resync.
- **`docs-system.sha256`** is the generated manifest — one `sha256  <path>` line per mirrored file,
  hashed from the source. It is what `--check` compares against.

Verify:

```sh
ai/skills/writing-app-code/scripts/sync-references.sh --check
```

Resync:

```sh
ai/skills/writing-app-code/scripts/sync-references.sh
```

The full procedure, including reconciling the selectors below and reinstalling the agent adapters,
is [`/sync-architecture-references`](../../../commands/sync-architecture-references.md).

## `web-manifest.md`, `server-manifest.md` — written, and maintained by hand

The changed-path → document selectors. They are **derived** from `docs/system/web-index.md` and
`docs/system/server-index.md`, but they are not generated: mapping "a change touching `hooks/`" onto
"read `guides/placing-web-hooks.md`" is a judgment the indexes' prose supports and no script can
extract reliably.

So they are maintained deliberately, and they carry a standing disclaimer: the index is
authoritative, the table is a head start. Any document the index covers and the table misses is
still in scope — and is a bug in the table, to be fixed on the next sync run.
