---
id: T1
title: 'Promote the arrival-inspection schema migration: two relations, ten seeded Reasons, two conformance columns and their thirteen checks'
layer: 'migration'
deps: []
acs:
  [
    'AC-03',
    'AC-04a',
    'AC-09',
    'AC-13',
    'AC-14',
    'AC-15b',
    'AC-17',
    'AC-17a',
    'AC-19',
    'AC-24',
    'AC-25',
  ]
files_hint:
  - 'docs/features/arrival-inspection/migrations/01-create-arrival-inspection-schema.ts'
  - 'apps/server/migrations/'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T1 — Promote the arrival-inspection schema migration

## Why

Every structural rule this feature relies on is a schema fact rather than a runtime check: the
one-Rejection-per-Reason-per-line uniqueness (AC-09), the Source/Delivery Mode agreement (AC-25), the
Not-applicable-only-on-an-uninstructed-line rule (AC-17, AC-17a) and both prose bounds (AC-14,
AC-15b). Derives from [data-model.md §Entities](../data-model.md),
[data-model.md §Migrations](../data-model.md) and [sad.md §7](../sad.md).

## What

Promote [`01-create-arrival-inspection-schema.ts`](../migrations/01-create-arrival-inspection-schema.ts)
to `apps/server/migrations/1786800000000-CreateArrivalInspectionSchema.ts` — a rename only; the class
name already carries that timestamp and sorts after the last shipped migration
(`1786700300000-DropReceivedQuantity`). It creates `rejection_reasons` and
`purchase_draft_line_rejections`, seeds the ten catalogue rows with `unfit_other` as the only one
carrying `requires_description`, adds `pre_receipt_conformance` and `pre_receipt_conformance_note` to
the populated `purchase_draft_lines`, and adds `uq_purchase_draft_lines_id_warehouse_mode` as the
composite reference target. **No shipped migration is edited.**

## Definition of Done

- [ ] The staged file is promoted under its live name and applies cleanly against a development
      database that already holds `purchase_draft_lines` rows with recorded endings.
- [ ] It **reverts** cleanly against that same populated database, and the pre-existing rows are
      unchanged before and after.
- [ ] Every pre-existing line reads `NULL` in both conformance columns and is refused by no new check
      — `chk_purchase_draft_lines_pre_receipt_conformance_instruction` and
      `…_conformance_requires_ending` must both be satisfied by rows that carry neither judgement.
- [ ] Integration tests assert `uq_purchase_draft_line_rejections_line_reason` refuses a second
      Rejection naming the same Reason on one line (AC-09).
- [ ] Integration tests assert `chk_purchase_draft_line_rejections_source_matches_mode` in **both**
      directions — Inspected with `direct_to_customer` and Customer-reported with `via_warehouse` are
      each refused (AC-25).
- [ ] Integration tests assert the composite FK refuses a Rejection whose `warehouse_id` or
      `delivery_mode` disagrees with its line's.
- [ ] Integration tests assert `not_applicable` is refused on a line frozen with a Packaging Type or a
      Value-adding Note, and `met`/`not_met` are refused on a line frozen with neither (AC-17, AC-17a).
- [ ] Integration tests assert `chk_purchase_draft_lines_conformance_requires_ending` refuses a
      judgement on a line with no ending and on one whose `ending_quantity` is 0 (AC-04a).
- [ ] Integration tests assert both `char_length ≤ 1000` bounds at exactly 1 000 and 1 001 **Cyrillic**
      characters — the bound is characters, not bytes (AC-14, AC-15b).
- [ ] Integration tests assert `quantity > 0` and the `source`/`disposition` value domains
      (AC-03, AC-19, AC-24).
- [ ] Deleting a Reason any Rejection names is refused by `ON DELETE RESTRICT`; deleting an unused one
      is permitted.
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**Never run `migration:generate`** in this repository ([data-model.md](../data-model.md) § "Never run
`migration:generate`"). The staged file is written by hand and promoted by rename.

**Hard rule** ([spec.md §6](../spec.md) Catalogue integrity): this migration is the only one that ever
inserts a `rejection_reasons` row, and no migration — this one or any later — may update or delete
one. T14 adds the check that asserts it.

The two conformance columns are added **nullable and are not backfilled**: [spec.md §8](../spec.md)'s
tenth question leaves endings recorded before this release untouched. The converse constraint —
"every ending that received something carries a judgement" — is deliberately **not** expressed; it
would refuse every shipped row the moment it was added ([data-model.md](../data-model.md)
§ `purchase_draft_lines`).

`uq_purchase_draft_lines_id_warehouse_mode` leads with `id`, so it is unique by the primary key alone
and cannot fail on the populated table.
