---
id: T12
title: 'Build the four-shape condition projection and the Rejection Reason catalogue query'
layer: 'app'
deps: [T6, T9]
acs: ['AC-06', 'AC-21', 'AC-22', 'AC-23', 'AC-23a']
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/queries/read-purchase-draft.query.ts'
  - 'apps/server/src/purchase-drafts/usecases/queries/list-purchase-draft-lines.query.ts'
  - 'apps/server/src/purchase-drafts/usecases/queries/list-rejection-reasons.query.ts'
  - 'packages/contracts/src/purchase-drafts/purchase-drafts-projections.ts'
owner: 'Security Lead'
estimate: 'L'
status: 'todo'
---

# T12 — Build the four-shape condition projection and the catalogue query

## Why

AC-22 is not "require both Permissions": a member without `REJECTIONS:WATCH` still reads the draft, the
line, and the ordered, presented, accepted and total refused figures — only the **cause** is withheld.
Because customer identity is withheld independently, the line has **four** legal shapes, and a matrix
covering only two leaves half the projection unproven. Derives from [sad.md §6.3](../sad.md),
[sad.md §4](../sad.md) § "The cause of a refusal is redacted at the projection" and
[sad.md §10](../sad.md) § Redaction unit.

## What

Extend `ReadPurchaseDraftQuery` and `ListPurchaseDraftLinesQuery` to build each line's condition
account and to choose one of four shapes from `observedPermissionIds` — cause and identity, cause
only, identity only, neither. Model all four in the contracts line projection: the two cause-withheld
shapes **omit the rejections array as a property**, so a leak is a contract violation rather than a
rendering artefact.

Add `ListRejectionReasonsQuery` — a thin read of workspace-wide reference data taking no Warehouse
scope, exactly as `ListPackagingTypesQuery` does (AC-06).

## Definition of Done

- [ ] **One test per shape — four per line-bearing read, not two.** Each proves that everything the
      actor may read is unchanged and that only the intended half is withheld.
- [ ] In the cause-withheld shapes the rejections property is **absent**, not empty and not null; a
      test asserts `'rejections' in line === false`.
- [ ] In the cause-withheld shapes no Reason, description, Disposition, count, badge, total-of-refusals
      or placeholder survives, and **nothing indicates that anything was withheld** — a test compares
      the serialized output against a line carrying one unexplained refusal and asserts they are
      indistinguishable except for the figures.
- [ ] The one total refused figure **is** carried in the withheld shape; that a refusal happened stays
      visible because presented and accepted differ (AC-22).
- [ ] The withheld columns are **not selected** — an assertion proves the query issued for the withheld
      shape does not name them, rather than fetching and deleting.
- [ ] The full shape carries each refused quantity beside its Reason, description, Source and
      Disposition, with ordered, presented, accepted and rejected (AC-21).
- [ ] A test extends the catalogue after a Rejection is recorded and proves the read is unchanged
      (AC-23a); another proves the Packaging Type shown is the one frozen on the line (AC-23).
- [ ] A line whose ending predates this release renders its absent case — no conformance, no
      Rejections, accepted equal to the ending quantity.
- [ ] `ListRejectionReasonsQuery` returns the catalogue whole, unpaged, taking no Warehouse scope, and
      reports `requiresDescription` per Reason (AC-06, AC-07).
- [ ] `pnpm --filter @warehouser/server test`, `test:integration`, `lint` and `build` are green.

## Notes

**Hard rule** ([spec.md §6.1](../spec.md) abuse cases): a placeholder is itself a disclosure that can
be probed. No `hidden` chip, no count, no greyed row, no `null` field.

**Compile-coupled lane.** This task changes the line projection into a four-member union, which is why
it lands with the query that satisfies it rather than in T9 — a standalone contract change of this
shape cannot be committed green. It shares `purchase-drafts-projections.ts` with T9's file set, so
`implement` serializes the two.

The four shapes are what T17 renders and T14 asserts the metadata for; a shortfall here is invisible
until one of those two finds it.
