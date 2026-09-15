---
description: Resynchronize the writing-app-code skill's architecture references with docs/system, reconcile its changed-path selectors, and refresh the installed agent adapters.
argument-hint: [--check] [target-agent]
---

# Sync architecture references

`docs/system` is the source of truth for every durable rule in this repository. The
[`writing-app-code`](../skills/writing-app-code/SKILL.md) skill carries a byte-for-byte mirror of it
under `ai/skills/writing-app-code/references/docs-system/`, so that an installed copy of the skill
holds the same instructions the repository does.

This command reconciles the mirror with its source. It copies **out of** `docs/system` and never
into it: a rule is changed by editing `docs/system` (through
[`ai/skills/system-docs/SKILL.md`](../skills/system-docs/SKILL.md)), and this command propagates
that change outward.

Run it whenever a `docs/system` document is added, edited, renamed, moved, or removed — which
includes the same change that updates `docs/system/web-index.md` or `docs/system/server-index.md`,
since `AGENTS.md` already requires those indexes to move with their documents.

## Inputs and preconditions

- Run from the repository root.
- `--check` runs in verification mode: report drift and exit non-zero, write nothing. Use it in a
  review, or to decide whether a sync is needed at all.
- The optional target-agent argument (`claude`, `codex`, …) selects whose installed adapters are
  refreshed in step 5. When omitted, infer it from the current agent identity or from an unambiguous
  existing project-local installation; if several are possible, ask and stop.
- Do not edit anything under `references/docs-system/` by hand at any point, in any mode.

## Procedure

### 1. Verify before writing

```sh
ai/skills/writing-app-code/scripts/sync-references.sh --check
```

The script reports four kinds of drift and exits non-zero on any of them:

| Report    | Meaning                                                             |
| --------- | ------------------------------------------------------------------- |
| `MISSING` | A `docs/system` file has no mirrored copy.                          |
| `STALE`   | A mirrored copy differs from its source, or the manifest is behind. |
| `ORPHAN`  | A mirrored file whose source no longer exists.                      |
| clean     | The mirror equals `docs/system`; the file count is printed.         |

If the mode is `--check`, print the report and stop here. A clean report means nothing further is
needed; a dirty one means this command must be run without `--check`.

### 2. Sync the mirror

```sh
ai/skills/writing-app-code/scripts/sync-references.sh
```

It copies every file under `docs/system` into `ai/skills/writing-app-code/references/docs-system/`
preserving the tree, deletes mirrored files whose sources are gone, prunes the directories that
empties, and rewrites `references/docs-system.sha256` from the **source** files. It prints one line
per added, updated, or removed file — read that list; it is the set of rules that changed.

The script is idempotent: a second run with unchanged inputs writes nothing.

### 3. Reconcile the changed-path selectors

The mirror is generated; the two selectors are not. For every document the previous step reported as
added, updated, or removed, re-derive the affected rows:

1. Read the applicable index in full — `docs/system/web-index.md`, `docs/system/server-index.md`, or
   both. The index's «when it applies» sentence for each entry is what a selector row encodes.
2. Update [`references/web-manifest.md`](../skills/writing-app-code/references/web-manifest.md) and
   [`references/server-manifest.md`](../skills/writing-app-code/references/server-manifest.md):
   - a **new** document → add a row naming the changed paths and code shapes that pull it in, or add
     it to the floor when the index says it governs every change in that app;
   - a **renamed or moved** document → fix every row and cross-reference that names its old path;
   - a **removed** document → delete its rows, and check whether a successor document took over its
     trigger, including any superseding ADR;
   - an **edited** document whose «when it applies» changed → restate the trigger in the row;
   - an ADR whose status moved to **Accepted** → make sure the floor's "every Accepted ADR" line
     still resolves, and give it its own row when it governs a specific path.
3. Do not paraphrase a rule into a selector row. A row names a trigger and a document; the rule
   itself stays in `docs/system`.

### 4. Check the rest of the skill for stale paths

Grep the skill for references to documents that moved or disappeared:

```sh
grep -rn 'docs/system\|docs-system/\|guides/\|adr/' ai/skills/writing-app-code --include='*.md' \
  | grep -v '^ai/skills/writing-app-code/references/docs-system/'
```

Every `docs/system` path named in `SKILL.md`, in either selector, or in
`references/README.md` must resolve to a file that exists. Fix the ones that do not.

Also confirm the skill still states no rule of its own. If reconciliation tempted you to copy a rule
into `SKILL.md`, put it back in `docs/system` and link to it — a paraphrase forks the source of
truth, which is the single failure this whole arrangement exists to prevent.

### 5. Refresh the installed adapters

Installed skills are complete materialized copies, never links
([`update-agent.md`](update-agent.md)). A synced canonical skill is not a synced installed skill, so
recopy it for the target agent:

- Claude Code → `.claude/skills/writing-app-code/`
- Codex → `.codex/skills/writing-app-code/`
- another target → its project-local skills directory, derived from its installed configuration or
  official documentation

Copy the whole directory — `SKILL.md`, `references/` including `docs-system/` and the manifest,
and `scripts/` with its executable bit intact. Running
[`update-agent.md`](update-agent.md) for the target does this along with everything else, and is the
preferred route when more than this one skill has moved.

### 6. Verify again

```sh
ai/skills/writing-app-code/scripts/sync-references.sh --check
git status --short
```

Then confirm, for each installed copy: the mirrored file count matches `docs/system`, the copy
contains no symbolic links, and `scripts/sync-references.sh` is still executable.

## Safety rules

- Never write to `docs/system` from this command. It is the source; this is the copy.
- Never edit a file under `references/docs-system/`. Fix `docs/system` and resync.
- Never resolve drift by deleting the mirror wholesale and disabling the check.
- Do not commit with the check failing — a stale mirror is an installed skill instructing an agent
  from rules the repository has already changed.

## Completion report

Report: the check result before and after, the added/updated/removed document list, the selector
rows changed and why, any stale path fixed, which installed adapters were refreshed, and
`git status --short`. If a document changed but no selector row did, say so explicitly — that is a
claim that its trigger did not move, not an omission.
