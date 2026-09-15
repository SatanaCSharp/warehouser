---
name: writing-app-code
model-tier: reasoning
reasoning-effort: high
description: >
  Use BEFORE and WHILE writing or changing any production source file under `apps/web/src` or
  `apps/server/src` — every implementation, refactor, fix, or hand edit, whether it came from
  `/implement`, `/fix`, a task, a bug report, or a direct request. Loads the architecture that
  governs the file being written: `docs/system/web-index.md` for `apps/web`,
  `docs/system/server-index.md` for `apps/server`, both when the change crosses the boundary, and
  the guides and Accepted ADRs those indexes select for the touched paths. Triggers on "add a
  component/hook/module/route/dialog/table/slice/endpoint", "add a use case/controller/repository/
  entity/migration/guard/handler", "implement", "refactor", "fix this", "change this behavior",
  "напиши компонент", "додай use case". Does NOT apply to test files (`*.spec.ts(x)`, `src/test/`)
  or to documentation.
---

# Skill: writing-app-code

The **write-time architecture gate**. `code-review-front-end` and `code-review-back-end` ask, after
the fact, whether a change follows the rules this repository already decided. This skill exists so
the answer is yes before the code is written: it puts the governing documents in context **first**,
and only then is the file edited.

It is a router, not a rulebook. Every rule lives in `docs/system` and stays there — this file
deliberately restates none of it, because a paraphrase becomes a second, quietly wrong source of
truth the moment a guide is edited. What this skill owns is: _which_ documents govern the file you
are about to touch, _when_ to read them, and _what must be true_ before the edit is called done.

## When it applies

**In scope — read the documents before the first edit:**

| Path                                        | Index to read                 |
| ------------------------------------------- | ----------------------------- |
| `apps/web/src/**` (production source)       | `docs/system/web-index.md`    |
| `apps/server/src/**` (production source)    | `docs/system/server-index.md` |
| Both in one change                          | **Both indexes**              |
| `packages/contracts/**` reached from either | Both indexes' §Shared entry   |

**Out of scope — this skill does not gate them:**

- Test files: `*.spec.ts`, `*.spec.tsx`, `*.integration.spec.ts`, anything under `apps/*/src/test/`
  or `apps/web/src/test/architectural/`. Tests have their own owners —
  `guides/placing-web-tests.md` and `server-architecture.md` §testing — read those directly.
- Configuration, build files, `docs/`, `ai/`, `packages/oxlint-config`, `packages/tsconfig`.
- Reading, exploring, or reviewing code. Exploration is `AGENTS.md` §Exploring code; review is
  [`../code-review-front-end`](../code-review-front-end/SKILL.md) /
  [`../code-review-back-end`](../code-review-back-end/SKILL.md).

A change that starts in a test and ends in production source is in scope the moment it reaches
production source. So is a one-line edit: the size of a diff has never been what decides whether a
rule applies to it.

## Source of truth

`docs/system` is the source of truth. `AGENTS.md` says so, and nothing in this skill overrides it.

`./references/docs-system/` is a **byte-for-byte mirror** of `docs/system`, kept so that an
installed copy of this skill (in `.claude/skills/`, `.codex/skills/`, a worktree, a subagent with a
narrow tool set) carries the same instructions the repository does. It is generated, never edited.

Precedence when reading:

1. `docs/system/<path>` — read this when the repository tree is available. It cannot be stale.
2. `./references/docs-system/<path>` — the same bytes, verified by
   [`./references/docs-system.sha256`](./references/docs-system.sha256). Read it when `docs/` is not
   reachable, or when it is simply the closer copy.
3. If the two ever disagree, **`docs/system` wins**, and the mirror is stale — run
   `ai/skills/writing-app-code/scripts/sync-references.sh` (or the
   [`/sync-architecture-references`](../../commands/sync-architecture-references.md) command) before
   trusting the mirror again.

Verify in one command:

```sh
ai/skills/writing-app-code/scripts/sync-references.sh --check
```

## Protocol

### 1. Classify the surface, before opening an editor

Name the app each file belongs to (`apps/web`, `apps/server`, both, plus `packages/contracts`), and
confirm the change is production source rather than a test. If the surface is genuinely unknown
because the task is still vague, resolve that first — a document selected for the wrong app is worse
than none.

### 2. Read the index in full

`docs/system/web-index.md`, `docs/system/server-index.md`, or both. In full, this run — not from
memory. The index is the authoritative list of what governs an app, and its «when it applies»
sentences are what every later selection is derived from. An index entry that has changed since you
last read it is exactly the case this step exists for.

### 3. Select the governing documents

Use the changed-path selector for the app:

- [`./references/web-manifest.md`](./references/web-manifest.md) — `apps/web/src` paths → documents.
- [`./references/server-manifest.md`](./references/server-manifest.md) — `apps/server/src` paths →
  documents.

Both start from a **floor** that is always in the manifest — the index, the app's architecture
document, `architecture-map.md` — then add per-path entries.

Accepted ADRs are selected, not read wholesale. Each entry in the index's §Decisions ends with a
«Read before …» sentence naming what triggers it, and that sentence is the test; the manifests'
«Which ADRs the change triggers» section states the rule and its three qualifications. Where the
trigger is arguable, read the ADR — ambiguity resolves toward reading, and a Superseded ADR is never
in the floor.

The selectors are a starting point, not the authority: anything the index covers and the table does
not, re-derive from the index's own descriptions — and report the gap so the table gets fixed.

### 4. Read every selected document in full

In full, not skimmed to the heading that looks relevant. These documents carry their prohibitions
next to their procedures, and the prohibition is usually the part that decides the design —
`writing-web-components.md` §6's ban on the `if`/`else if` chain, `server-use-case-boundaries.md`'s
"nothing may surround `execute`", `web-motion.md`'s two bans. A skim reaches the procedure and
misses the ban.

### 5. Locate the existing code with the index, not with a directory walk

`AGENTS.md` §Exploring code governs this step: `pnpm graph query <symbol>` → `pnpm graph node
<symbol>` → read the returned line range → `pnpm snapshot <dir>` only when the shape of a whole area
is the question. Check `pnpm graph:status` reports `Index is up to date` before trusting an answer.

Neighbouring code is evidence of what exists, never authorization for what you write. When sibling
code and a `docs/system` rule disagree, the rule wins and the sibling is a finding.

### 6. Write the code against the documents you just read

Apply the selected rules as you write, not as a cleanup pass afterwards. Placement decisions
(which module, which directory, which layer) are made **before** the file is created, because moving
a file later is the expensive half of the mistake.

Where a document names exactly one permitted mechanism for a concern — one dialog component, one
data-fetching boundary, one logger, one validation technology, one conditional element — use that
one. Introducing a second mechanism is an ADR-sized decision
([`../decide-adr`](../decide-adr/SKILL.md)), not an implementation detail.

### 7. Self-check, then run the gate

Before calling the edit done, walk every changed production file against every rule the manifest
selected, and state for each file which documents governed it. Then run the gate for the app you
touched:

| App           | Gate                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| `apps/web`    | `pnpm --filter @warehouser/web lint` · `build` · **`test:all`**                  |
| `apps/server` | `pnpm --filter @warehouser/server lint` · `typecheck` · `build` · **`test:all`** |

`test:all`, not `test`. Each app's `test` script runs the unit tier only — `apps/web`'s
architectural tier has its own Vitest config and `apps/server`'s adds the integration tier on top of
that, and neither is reachable from `test`. A change that violates an architectural rule passes
`test` and fails at the commit, which is the whole failure this step exists to prevent
(`.husky/pre-commit` runs the server architectural tier for any staged `apps/server/src/**/*.ts`).

`apps/web` has no `typecheck` script; its `build` (`tsc -p tsconfig.json && vite build`) is the type
check.

A rule you could not satisfy is a finding to report, not a silence. Say which document, which
heading, and why.

## Definition of Done

- The surface was classified, and every changed file is production source under `apps/web/src` or
  `apps/server/src` (or an in-scope `packages/contracts` file).
- The applicable index — `web-index.md`, `server-index.md`, or both — was read **in full this run**.
- Every document the manifest selected for the touched paths was read in full, and the list of them
  can be named.
- Every changed file was written against those documents, with placement decided before creation.
- The one-permitted-mechanism rules were honoured, or a second mechanism was routed to an ADR.
- The gate for the touched app passes: `lint` at `--max-warnings=0`, `build` (plus `typecheck` on
  the server), and **`test:all`** — the unit tier alone is not the gate.
- Anything the documents did not cover, or covered contradictorily, is reported rather than decided
  silently.
- Structural self-check ([`../_shared/self-check.md`](../_shared/self-check.md)): name the documents
  read and the file each one governed. If that list cannot be produced, the gate did not run.

## Anti-patterns

- **Writing first and consulting `docs/system` afterwards.** That is the review gate, and it is a
  worse and more expensive version of this one. The documents go into context before the edit.
- **Working from remembered conventions.** The index exists because the rules move. What you
  remember about this repository's dialogs, tables, motion, or use-case boundaries was true at some
  point; read the document.
- **Copying the neighbouring file.** Sibling code is not a rule. A pattern repeated nine times is
  nine instances of whatever it is, including a violation.
- **Reading only the heading that looks relevant.** The prohibitions live beside the procedures.
- **Restating a rule in this skill, a task file, or a comment.** A paraphrase forks the source of
  truth. Link to the document and its heading instead.
- **Editing `references/docs-system/`.** It is generated. Change `docs/system`, then resync.
- **Treating a small diff as exempt.** One line in a use case can break
  `server-use-case-boundaries.md`; one ternary can break `writing-web-components.md` §6.
- **Selecting the other app's documents.** Web rules do not govern server files, and a cross-boundary
  change needs both indexes rather than the nearer one.
- **Skipping the skill because `/implement` already ran.** `/implement` writes code; this is the
  gate that says what the code must look like. Both run.

## References

- [`./references/web-manifest.md`](./references/web-manifest.md) — `apps/web/src` changed-path →
  document selector.
- [`./references/server-manifest.md`](./references/server-manifest.md) — `apps/server/src`
  changed-path → document selector.
- [`./references/README.md`](./references/README.md) — what the mirror is, how it is kept honest.
- [`./references/docs-system/`](./references/docs-system/) — the verified mirror of `docs/system`.
- [`./scripts/sync-references.sh`](./scripts/sync-references.sh) — sync and `--check` the mirror.
- [`../../commands/sync-architecture-references.md`](../../commands/sync-architecture-references.md)
  — the command that resyncs the mirror and reconciles the selectors after `docs/system` changes.
- [`../code-review-front-end`](../code-review-front-end/SKILL.md),
  [`../code-review-back-end`](../code-review-back-end/SKILL.md) — the after-the-fact gates this one
  is designed to leave with nothing to find.
