---
id: T14
title: 'Add the three architecture checks that make the condition guarantees mechanical rather than remembered'
layer: 'tests'
deps: [T13]
acs: ['AC-01a', 'AC-22', 'AC-23a']
files_hint:
  - 'apps/server/src/purchase-drafts/module-boundaries.spec.ts'
  - 'apps/server/src/shared/domain/repositories/repository-boundaries.spec.ts'
  - 'tests/refactor/'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T14 — Add the three architecture checks

## Why

Three of this feature's guarantees are one forgotten decorator or one careless migration away from
silently disappearing, and none of them fails a test when it does. Derives from
[sad.md §10](../sad.md) § Architecture and [sad.md §8](../sad.md) § Authorization coverage.

## What

Add three repository-wide checks:

1. **Observed-Permission coverage.** Every ending route whose request schema carries a `rejections`
   property declares `@ObservedPermission(REJECTIONS:CREATE)`, and every read whose response schema
   can carry a Rejection's cause declares `@ObservedPermission(REJECTIONS:WATCH)`. This is the check
   that makes the capability refusal (AC-01a) and the cause redaction (AC-22) mechanical rather than
   remembered.
2. **Catalogue extend-only.** No migration under `apps/server/migrations/` updates or deletes a
   `rejection_reasons` row (AC-23a).
3. **The locked-line projection stays narrow.** `arrival-confirmation.repository.ts`'s
   `lockDraftLineForEnding` does not select `ordered_quantity`.

## Definition of Done

- [ ] Each of the three checks fails against a **deliberately non-conforming fixture** — a route with
      `rejections` and no observed declaration, a migration statement updating a catalogue row, a
      projection naming `ordered_quantity` — not only passing against the conforming corpus.
- [ ] Each check asserts its corpus is **non-empty**, so a glob that stops matching fails loudly rather
      than passing vacuously.
- [ ] The checks report the offending file and symbol, not just a boolean.
- [ ] The existing boundary checks stay green: controllers call use cases only, `purchase-drafts`
      domain code imports no framework, shared repositories import no feature module.
- [ ] `pnpm --filter @warehouser/server test`, `lint` and `build` are green, and the root suite passes.

## Notes

Check 2 is where the extend-only rule actually lives. [data-model.md](../data-model.md) records
deliberately that PostgreSQL cannot enforce it: `ON DELETE RESTRICT` on
`fk_purchase_draft_line_rejections_reason` stops a **delete** of any named Reason, but nothing stops an
`UPDATE … SET label = …`, and the only mechanisms that would are a trigger or a revoked privilege —
neither of which this repository has. This check is the enforcement.

Check 3 guards the [sad.md §11](../sad.md) risk T5 carries. Treat any third column added to the locked
projection as a finding, not as a refactor.

Check 1's corpus is schema-driven, not name-driven: derive "carries a `rejections` property" and "can
carry a Rejection's cause" from the contract schemas, so a new route inherits the rule automatically.
