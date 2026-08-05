---
name: change-request
model-tier: reasoning
reasoning-effort: high
workers: [domain-expert, explorer, critic, devils-advocate]
description: >
  Use when intended behavior or business logic must change without creating a new feature. Triggers
  on "change request", "change the existing behavior", "override this business rule",
  "replace the current behavior", "/change-request {slug}", and requests that deliberately amend,
  replace, or remove an existing rule. Creates docs/change-requests/{slug}/change.md, spec.md,
  .size, and .route, then hands the universal work item to the normal clarify/design/tasks/
  implement/review/ship pipeline. Do not use for a new capability (specify) or a regression (fix).
---

# Change request

Create a first-class delivery unit for an intentional change to existing behavior or business
logic. A change request may affect zero, one, or many features, system rules, contracts, or legacy
code paths. It never creates another feature directory.

Read [`../_shared/work-item.md`](../_shared/work-item.md) first. This skill creates the
`change-request:<slug>` work item; downstream stages reuse that identifier and resolve the same
artifact root. Apply the shared Socratic, domain, critic, size, and handoff conventions rather than
duplicating them:
[`../_shared/domain-expert-first.md`](../_shared/domain-expert-first.md) ·
[`../_shared/socratic-loop.md`](../_shared/socratic-loop.md) ·
[`../_shared/critic.md`](../_shared/critic.md) ·
[`../_shared/size-matrix.md`](../_shared/size-matrix.md) ·
[`../_shared/handoff.md`](../_shared/handoff.md).

## Boundary with adjacent flows

- New capability or product outcome → `specify`.
- Existing intended behavior is implemented incorrectly → `fix`.
- Intended behavior or business logic must become different → `change-request`.
- Architecture decision with no observable behavior change → `decide-adr`.

When intent is mixed, split independent new capability into a feature and retain only the override
in this request. Do not hide feature creation inside a change request.

## Inputs

- `<slug>` — one lowercase word (`access`) or multiple lowercase words in kebab-case
  (`stock-access`); invocation is `/change-request <slug>`.
- The current behavior and desired behavior, supplied by the user or located in canonical artifacts
  and code.
- `docs/system/`, `docs/features/*/spec.md`, contracts, ADRs, and code paths that plausibly own the
  behavior. Read only targeted sources identified from the request; do not broad-scan unrelated
  features.
- Optional external ticket or policy source.

## Protocol

1. **Create only the change-request root.** Resolve
   `work_item_root = docs/change-requests/<slug>`. Refuse an invalid slug. If the directory exists,
   read it and ask before replacing any established decision; otherwise create no other work-item
   directory.
2. **State the behavioral delta.** Capture one testable sentence:
   `When <context/action>, current behavior is <old>; approved behavior will be <new>.` Ask only for
   missing information. If the old behavior is merely broken, redirect to `fix`.
3. **Domain gate.** Run the domain-expert-first protocol for changed rules, invariants, actors, and
   state transitions. A change to business logic is a product/domain decision; never infer it from
   implementation alone.
4. **Locate ownership and baseline.** Dispatch `explorer` read-only to identify the narrow set of
   canonical requirements, system rules, contracts, tests, and code paths implementing the current
   behavior. Record the current Git revision as `baseline_revision`. An undocumented legacy rule is
   legal, but mark its source as `code-only` with an evidence path.
5. **Build the override map.** Classify every delta as `ADD`, `AMEND`, `REPLACE`, or `REMOVE`.
   `AMEND`/`REPLACE`/`REMOVE` require an affected source, old behavior, new behavior (or explicit
   absence), compatibility impact, affected consumers, migration/rollout needs, and rollback.
   Omission means unchanged; it never means silently removed.
6. **Impact analysis.** Cover domain invariants, permissions, workflows/state, API/events, persisted
   data, UI, cross-feature effects, security/privacy, operations, tests, and documentation. Mark
   each `affected`, `unchanged`, or `N/A — reason`. For breaking or transitional behavior, define
   the compatibility window and exit condition.
7. **Draft `change.md`.** Copy [`templates/change.md`](templates/change.md), fill all sections, and
   preserve direct links to affected sources. This is the permanent historical old-to-new record.
8. **Draft `spec.md`.** Copy [`templates/spec.md`](templates/spec.md). Describe the behavior this
   request makes authoritative, using `CR-US-NN` and `CR-AC-NN`. Include explicit regression
   boundaries for important behavior that must remain unchanged. Link each changed criterion to
   its override-map row; do not duplicate complete affected feature specs.
9. **Classify size and route.** Run `classify-size` inline against
   `change-request:<slug>`. Besides normal scope signals, escalate for breaking consumers,
   cross-domain effects, data reinterpretation/migration, coordinated rollout, or hard rollback.
   Write `.size` and `.route` only under the change-request root.
10. **Ambiguity and coherence gates.** Dispatch `devils-advocate` in ambiguity mode over `change.md`
    - `spec.md`, then `critic` over their combined coherence. Resolve every cited finding with the
      user. In particular, reject an override whose source, precedence, compatibility, or unchanged
      boundary could be interpreted two ways.
11. **Self-check and write.** Re-read the artifacts and verify: (1) no new `docs/features/`
    directory was created; (2) every non-ADD row identifies an old source; (3) every override maps
    to at least one `CR-AC`; (4) every `CR-AC` maps back to an override or regression boundary;
    (5) compatibility, rollout, and rollback are explicit; (6) `.size` and `.route` are valid.
12. **Commit and handoff.** Propose `change-request: <slug> specify behavior change`. Emit the stage
    handoff with Review paths under `docs/change-requests/<slug>/` and Run next
    `/clarify change-request:<slug>` (or the route-approved `/design change-request:<slug>` skip).

## Downstream contract

- Every downstream skill receives `change-request:<slug>`, never the bare slug.
- Tasks use `CR-AC-*` in `acs` and add top-level `kind: "change-request"` plus
  `source_refs: [...]` where the task changes previously documented behavior.
- Implementation commits add `SDD-Change: <slug>` and `SDD-AC: CR-AC-NN` trailers.
- Review compares `change.md`, `spec.md`, affected sources at `baseline_revision`, implementation,
  and tests. It checks changed behavior, removed behavior, and explicitly unchanged regression
  boundaries.
- Ship reconciles canonical feature/system specifications only after PASS, with explicit reviewed
  edits and backlinks to this change request. It does not create or move a feature roadmap item.

## Definition of Done

- `docs/change-requests/<slug>/change.md`, `spec.md`, `.size`, and `.route` exist.
- The request contains a complete old-to-new override map with impact, compatibility, rollout, and
  rollback decisions.
- Every changed behavior is observable and testable through `CR-AC-*`; important unchanged
  behavior has a regression boundary.
- No additional feature directory was created or required.
- The normal pipeline can continue using the explicit `change-request:<slug>` identifier.

## Anti-patterns

- Creating `docs/features/<change-slug>/` as a transport for the request.
- Editing affected feature specs during intake and losing the historical baseline.
- Treating omitted behavior as removed.
- Reusing an existing AC identifier for different semantics.
- Calling a regression a change request to avoid the RED-first `fix` path.
- Shipping without reconciling the now-canonical behavior into its owning documentation.

## References and templates

- [`templates/change.md`](templates/change.md) — old-to-new decision and impact record.
- [`templates/spec.md`](templates/spec.md) — change-request acceptance contract.
- [`../_shared/work-item.md`](../_shared/work-item.md) — universal root and invocation rules.
