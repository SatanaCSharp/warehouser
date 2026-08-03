# Inputs + preconditions (step 1)

Resolve the invocation using [`../../_shared/work-item.md`](../../_shared/work-item.md) before this
gate. A bare slug uses `docs/features/<slug>`; `change-request:<slug>` uses
`docs/change-requests/<slug>`. Every literal feature path below means that resolved root. Validate
top-level `kind` when present; it must match the resolved kind.

## Hard gate

`docs/features/<slug>/tasks.json` must exist and parse as JSON. Missing or malformed → refuse: «run `tasks <slug>` first (it emits tasks.json)». Do not try to reconstruct tasks from the markdown — `tasks.json` is the contract.

## Validate the contract

The loaded `tasks.json` must satisfy the shape from the `tasks` skill:

- top-level `{ slug, tasks: [...] }` for features (unchanged), or
  `{ slug, kind: "change-request", tasks: [...] }` for change requests.
- each task: `id` (unique), `title`, `layer`, `deps` (array of existing ids), `acs` (array), `dod` (string), `files_hint` (array).
- `deps` forms a DAG (no cycles) — verified in step 4. A cycle is a hard error: report the cycle and stop (it is a `tasks` bug, not an `implement` one).

## Scaffold task sets (from `survey` greenfield)

A `tasks.json` with `slug: "_scaffold"` and `layer: scaffold` tasks comes from `survey`'s greenfield foundation (not from `tasks`). These tasks have **no feature `acs`** — they create the project skeleton (structure, baseline module, test harness, migration tooling, CI, conventions doc). Handle them specially:

- **The skeleton smoke test is the red→green anchor**, not a feature AC: RED = «the project does not build / boot / the tooling doesn't run»; GREEN = «build + boot + the empty test suite + the migration tool all succeed». Write that smoke test as part of the scaffold (task S2 in the foundation contract) and drive the skeleton to make it pass — no per-folder TDD theatre.
- Read `docs/system/architecture-map.md` and `docs/system/sad.md` for the exact stack and conventions to scaffold.
- After the scaffold is green the repo is real, and the normal per-feature flow (`specify → … → implement`) builds into it with real feature TDD.

## System-document manifest (hard gate)

Before dispatch, resolve a manifest per task from `files_hint` and place the exact paths in the task
brief. Start with `docs/system/architecture-map.md`, then add only the governing documents:

- `apps/server/**` → `docs/system/server-architecture.md`, every guide relevant to the changed
  layer (repository, module, contracts, errors), and applicable Accepted system ADRs.
- `apps/web/**` → `docs/system/frontend-architecture.md`, relevant web/UI/localization/error
  guides, applicable Accepted system ADRs, and the approved feature design handoff for UI work.
- packages/cross-application paths → the architecture documents, guides, and Accepted system ADRs
  governing each affected boundary.

The lead reads the manifest before dispatch. Every test-author, implementer, and reviewer then opens
the same files directly and reports them in its handover. An empty manifest, missing read evidence,
or an architecture violation blocks the task regardless of test results.

## Context the agents read directly

The engine does **not** paste these into prompts — each agent (or the sequential runner) reads them itself, so there's no paraphrase drift:

- `docs/features/<slug>/spec.md` — §5 acceptance criteria (the source of truth for what each test asserts).
- `docs/features/<slug>/test-plan.md` — the AC→test map, if `plan-tests` ran. **For XS/S the plan is usually inline instead** — a `## Test plan` section in `spec.md` (per the size matrix); check both locations and read whichever exists.
- `docs/features/<slug>/data-model.md` + the **staged** migration files under `docs/features/<slug>/migrations/` — the schema the code targets (a `layer: migration` task promotes them into the live `migrations/` tree; see «Staged migrations → promote» below).
- `docs/features/<slug>/contracts/openapi.yaml` — the API contract handlers must match.
- `docs/features/<slug>/sad.md` + Accepted `adr/` — the architecture and the locked decisions.
- The task's system-document manifest—the durable conventions new code must match. A sibling
  precedent is subordinate when it conflicts with these documents.
- `docs/features/<slug>/design-handoff.md` for every `ui` task — it must be `status: approved` and identify the exact Pencil frame and node ID. Missing or unapproved is a hard stop for UI implementation. Treat the handoff as visual/behavioral intent and the existing codebase as the architecture source; report visible deviations instead of silently redesigning.

## Staged migrations → promote before running

`data-model` stages each migration as a reversible TypeORM `MigrationInterface` class under `docs/features/<slug>/migrations/<NN>-<verb>-<entity>.ts` (feature-local ordinal) — **not** in the live server migration tree, so a design-stage schema cannot be applied before implementation. The `layer: migration` task(s) own **promotion**:

1. **Promote in ordinal order.** Copy each staged class into the live TypeORM migration directory using a fresh monotonically increasing timestamp in both filename and class name. Preserve `up`/`down` behavior and intra-feature order. After promotion the live file is canonical; the staged copy remains the design record.
2. **Then apply + verify.** Run the migration with the repo's tool against the (ephemeral, testcontainers) DB; the task's DoD «migration applies and reverts cleanly» is checked on the promoted file. The feature's integration tests run against the promoted schema.
3. **Commit** the promoted live file(s) with the migration task (the staged pair under `docs/features/<slug>/migrations/` was already committed by `data-model`).

A `layer: migration` task with **no** staged file under the feature's `migrations/` is a `tasks`/`data-model` mismatch—surface it; do not invent a migration.

## `ui`-layer tasks

A `layer: ui` task (present only when `sad.md` frontmatter `target_surfaces` declares a UI surface — `web-frontend` / `mobile-app` / `desktop-app`) runs through the **same TDD cycle** as any other task; it just follows the **repo's frontend test convention** — component / e2e-through-UI runners detected from `package.json` scripts (Playwright / Storybook / a visual-diff tool / etc.) — **not** a backend assumption. No engine change: command-detection already picks up frontend scripts in its cascade.

**Reuse the UI foundation (don't reinvent).** A `ui` task **composes the existing design system** from `architecture-map.md` §Frontend — reuse the existing components / shared primitives, pull design tokens (colors / spacing / typography) from the repo's token source, and build in the repo's **one** styling approach. Find the **closest existing screen/component** (the §Frontend UI precedent) and extend/compose it; write a **new** component only when no existing primitive fits, in the repo's styling approach — never a second one. This is the frontend echo of "match the repo + copy the closest precedent" → [`../../_shared/surfaces.md`](../../_shared/surfaces.md).

## Repo state

- Note the current branch. If `branch_strategy: feature` and the repo is on its default branch, create/switch to a feature branch before any commit (see [`settings.md`](./settings.md)).
- Do not touch unrelated dirty changes — work only the files each task's `files_hint` names.
