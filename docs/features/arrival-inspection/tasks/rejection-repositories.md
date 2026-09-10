---
id: T4
title: 'Add the Rejection Reason catalogue repository and the Rejection repository with its conditional amendment update'
layer: 'infra'
deps: [T3]
acs: ['AC-06', 'AC-07', 'AC-18', 'AC-18a', 'AC-18b', 'AC-26']
files_hint:
  - 'apps/server/src/shared/domain/repositories/rejection-reason-catalogue.repository.ts'
  - 'apps/server/src/shared/domain/repositories/purchase-draft-rejection.repository.ts'
  - 'apps/server/src/shared/domain/repositories/repository-boundaries.spec.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Add the two new specialized repositories

## Why

AC-06 and AC-07 need the catalogue resolved against a submission's stated Reasons in **one** read, not
one read per Reason. AC-18a needs the amendment to be a conditional update whose zero-row result is a
typed refusal rather than a silent no-op — and the locked resolve and that update cannot be separated
by another transaction, which is the whole point. Derives from
[sad.md §5](../sad.md), [data-model.md §Repository boundaries](../data-model.md) and
[sad.md §6.4](../sad.md).

## What

Add `RejectionReasonCatalogueRepository` — the `PackagingTypeCatalogueRepository` shape with one
method more: list the catalogue whole (ordered by `id`, taking no Warehouse scope) and resolve a
stated set of identifiers against it in one read, returning each row's `requiresDescription`.

Add `PurchaseDraftRejectionRepository` — resolve one Rejection in the acting Warehouse `FOR UPDATE`,
and apply the description and/or Disposition change as **one** conditional update whose predicate
excludes a return to Undecided.

Both live in `shared/domain/repositories/`, contain **no private methods**, import nothing from a
feature module, and accept and return shared persistence entities and persistence-oriented values
only.

## Definition of Done

- [ ] An integration test proves the catalogue set-resolve issues **one** statement for a submission
      naming several Reasons, and reports which of the stated identifiers the catalogue does not offer
      (AC-06).
- [ ] The resolve returns `requiresDescription` per row, so AC-07 is decided against the flag rather
      than against `unfit_other` by name.
- [ ] An integration test proves the catalogue list takes no Warehouse scope and is unpaged.
- [ ] An integration test proves resolving a Rejection whose `warehouse_id` is another Warehouse's
      returns **no row**, indistinguishably from an identifier that does not exist (AC-26).
- [ ] An integration test proves the resolve takes the row lock (`LockRows → Index Scan` on the
      primary key with `warehouse_id` as a filter).
- [ ] An integration test proves an amendment aimed back at `undecided` from a decided Disposition
      affects **zero rows**, and that the repository reports that as a distinguishable result rather
      than as success (AC-18a).
- [ ] An integration test proves a correction between two decided Dispositions affects one row, and
      that a description-only amendment leaves the Disposition untouched (AC-18, AC-18b).
- [ ] The amendment writes `amendedByUserId` and `amendedAt` together on every path that changes
      anything.
- [ ] `repository-boundaries.spec.ts` still passes with both new files in its corpus — no private
      method, no feature import.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

The amendment's state precondition is the **Rejection**, never the draft's state: a Closed draft's
Rejection is amendable ([sad.md §4](../sad.md)). This repository must not read or assert the draft's
state.

**Hard rule** ([sad.md §8](../sad.md) Consistency): state transitions are conditional updates, not
read-then-write. Do not implement AC-18a as a read, a comparison in TypeScript and then a write.

PGlite has one backend, so the concurrent-second-amendment race cannot be proven here; assert the
**shape** — the statement issued and the zero-row path — and do not write a test that implies the
race was proven ([sad.md §8](../sad.md)).
