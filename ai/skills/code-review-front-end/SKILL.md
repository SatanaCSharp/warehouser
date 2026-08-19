---
name: code-review-front-end
model-tier: reasoning
reasoning-effort: high
workers: [reviewer]
description: >
  Use after implementation to review an `apps/web` change against every `docs/system` document that
  governs the frontend — the frontend architecture, the web guides, and the Accepted web ADRs listed
  in `docs/system/web-index.md`. Triggers on "code review front-end {slug}", "review the web changes
  for {slug}", "does the web code follow the guides", "frontend architecture review",
  "/code-review-front-end {slug}", "/code-review-front-end change-request:{slug}", "перевір фронтенд
  на відповідність гайдам". Reads the web index and every applicable document in full, dispatches the
  read-only reviewer over the `apps/web` diff, and reports cited conformance findings. Runs for both
  feature and change-request work items. Hard-refuses when the diff touches no web code.
---

# Skill: code-review-front-end

The **frontend conformance gate**. After `implement` has written and committed the code, this skill
asks one question about the `apps/web` part of the change: **does it follow the durable frontend
rules the repository already decided?** Placement, ownership, layering, the one permitted mechanism
per concern — judged against `docs/system`, not against taste and not against the neighbouring file.

It is deliberately narrower than [`../review`](../review/SKILL.md): `review` owns spec/AC compliance
and cross-cutting quality; this skill owns architecture conformance for one app. Run it (and
[`../code-review-back-end`](../code-review-back-end/SKILL.md) when the server changed too) **before**
`/review`, so the independent AC pass reads already-conformant code.

Shared discipline: [`../_shared/system-conformance.md`](../_shared/system-conformance.md) — work-item
resolution, manifest building, rule precedence, finding format, resolution, record, verdict. Read it;
this file only states what is specific to the web app.

## Owner

A frontend reviewer who did **not** write the change. Clean context is the point — the reviewer
re-reads `docs/system` itself.

## Inputs

- `<slug>` — a feature slug, or the explicit `change-request:<slug>` work-item identifier
  ([`../_shared/work-item.md`](../_shared/work-item.md)). Both kinds are supported and both run the
  same protocol; the change-request run additionally reads `change.md` and scopes findings to lines
  the change wrote or moved.
- **Gate (hard refuse):** the diff must contain at least one file under `apps/web/`. If nothing web
  changed → «no `apps/web/` change in this diff — run `/code-review-back-end <slug>` instead», and
  stop without writing a record. If no implemented change exists at all → «run `implement <slug>`
  first».
- **Always read:** `docs/system/web-index.md` in full — it is the authoritative list of what governs
  `apps/web`, and it is what «all the front-end docs» resolves to.
- **Read for context, never as the rule:** `<work_item_root>/sad.md` (`target_surfaces`, §5–§6),
  Accepted `<work_item_root>/adr/`, and `design-handoff.md` when a UI surface was designed.

## Protocol

1. **Resolve the work item and scope the diff.** Per
   [`../_shared/system-conformance.md`](../_shared/system-conformance.md) §1. Scope is
   `git diff <base>..HEAD -- apps/web packages/contracts` on the work-item branch (base = the branch
   point), or the named changed files. `packages/contracts` is in scope **only** for how `apps/web`
   declares and consumes the schema; the server side of the same file belongs to
   [`../code-review-back-end`](../code-review-back-end/SKILL.md).
2. **Build the manifest.** Per §2 of the shared protocol, using
   [`./references/web-manifest.md`](./references/web-manifest.md) as the changed-path → document
   selector. The floor is always `frontend-architecture.md`, `architecture-map.md`, and every Accepted
   web ADR in the index; the selector adds the guides the touched paths pull in. Read each selected
   document **in full** before dispatch.
3. **Dispatch the reviewer.** Run the [`reviewer`](../../agents/reviewer.md) worker (read-only, clean
   context, **pinned to the `reasoning` judgment tier — Opus on the Claude adapter — at effort `high`,
   `xhigh` on an L/XL `.size`**; never let `model_reviewer` downgrade this pass) over the web diff
   with the manifest and the dimensions in
   [`./references/web-review-dimensions.md`](./references/web-review-dimensions.md). Pass the resolved
   work-item identifier, the manifest paths, and `artifact_language` in the dispatch prompt. For a
   large diff, fan out one reviewer per dimension group and merge. If a background reviewer returns an
   idle signal with no report, pull the report through the host's messaging channel — an idle signal
   is not a verdict ([`../_shared/agent-roster.md`](../_shared/agent-roster.md)).
4. **Collect cited findings.** Format and severity per shared §4 — every finding cites `file:line`
   **and** the `docs/system` path + heading it violates. Drop the uncited ones.
5. **Resolve each finding with the user.** Per shared §5: Fix now / Defer / Not an issue / Change the
   rule. Quote the cited rule text when asking.
6. **Write the record.** `<work_item_root>/_review/code-review-front-end-<date>.md` per shared §6.
7. **Verdict + next.** Emit the stage-handoff block ([`../_shared/handoff.md`](../_shared/handoff.md))
   — _What I did_ + _Review_ (the record path) + _Run next_:
   - `CHANGES REQUESTED` → `/implement <slug>` for the fixes (**no `/clear`** — stay in context), then
     re-run this skill over the changed surface.
   - `PASS` and the server also changed → `/code-review-back-end <slug>`.
   - `PASS` and the server did not change → (`/clear`, then) `/review <slug>`.

## Definition of Done

- The work item resolved to the right root, and a change request was measured against `change.md`
  and its baseline rather than against pre-existing violations.
- `docs/system/web-index.md` was read this run, and every document the manifest selected was read in
  full — the manifest is listed in the record.
- Every changed `apps/web` file was checked against every applicable manifest rule.
- Every finding cites `file:line` + a `docs/system` path and heading; every finding is resolved
  (fixed / deferred / dismissed-with-reason / routed to a rule change); no blocking finding is open.
- A record exists at `<work_item_root>/_review/code-review-front-end-<date>.md` with a `PASS` /
  `CHANGES REQUESTED` verdict.
- Re-reading the written record from disk and confirming every cited path resolves is this skill's
  **structural self-check** ([`../_shared/self-check.md`](../_shared/self-check.md)).

## Anti-patterns

- **Judging web code from remembered conventions.** The index exists because the rules move. Read it.
- **Reviewing `apps/server` here.** Server files in the same diff belong to
  [`../code-review-back-end`](../code-review-back-end/SKILL.md); note the crossover and move on.
- **Turning this into the AC review.** AC compliance is `/review`'s gate — flag, don't adjudicate.
- **Letting a sibling component settle a placement question.** Placement is decided by
  `placing-web-components.md` and the placement ADRs, not by what the folder already contains.
- **Citing the superseded module ADR.** `14-08-2026-domain-owned-flat-modules.md` is **Superseded**
  for web placement by `18-08-2026-scope-of-exercise-placement-tiebreak.md` — cite the successor for
  the rule and the predecessor only for reasoning.
- **Skipping the HeroUI docs lookup.** What you remember about HeroUI v3 is not reliable; the index
  says so itself — resolve the component through `heroui-react-v3-docs-index.md` before calling an
  API wrong.
- **A `PASS` with no manifest.** Without the list of documents read, the verdict is an opinion.

## References

- [`./references/web-manifest.md`](./references/web-manifest.md) — changed-path → document selector.
- [`./references/web-review-dimensions.md`](./references/web-review-dimensions.md) — what the reviewer
  probes, and the dispatch shape.
- [`../_shared/system-conformance.md`](../_shared/system-conformance.md) — the shared protocol.
