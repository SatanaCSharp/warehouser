---
id: T13
title: 'Assert case-count identity — the 39 baseline cases, none lost, plus enumerated additions'
layer: 'tests'
deps: ['T11', 'T12']
acs: ['CR-RG-01', 'CR-RG-04']
files_hint:
  [
    'apps/web/src/test/baselines',
    'apps/web/src/modules/workspace/components/workspace-administration/warehouses',
  ]
source_refs: []
owner: 'YuriiH'
estimate: 'S'
status: 'done'
---

# T13 — Assert case-count identity — the 39 baseline cases, none lost, plus enumerated additions

## Why

[`sad.md` §4.6](../sad.md#46-test-movement-is-governed-by-subject-not-by-describe-block): _"Case-count identity is the gate."_ It is the mechanical backstop behind risk R1 — the only automated check that a case was not quietly dropped during the re-split.

## What

Add a static test that reads the case names from `WarehousesTab.spec.tsx`, `WarehouseList.spec.tsx`, `WarehouseRow.spec.tsx` and `WarehousePeopleList.spec.tsx`, and asserts against the committed baseline inventory:

- the union is exactly the baseline's 39 names — none added, none missing, none renamed;
- the per-file distribution is 27 / 7 / 4 / 4 — the baseline's 25 / 7 / 4 / 3 plus the three
  additions review S3/S4/S5 required, each admitted by name in the gate's `ADDED_CASES`;
- each name appears exactly once across the four files.

The failure message must name the offending case, not just the count.

## Definition of Done

- [ ] the test passes at `HEAD` and fails with a named case when any one case is deleted, renamed or duplicated
- [ ] the distribution assertion is exact, not a lower bound
- [ ] the baseline file is **compared**, never regenerated to make the test pass
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

**Hard rule (`test-plan.md` §Test data):** the committed baselines are compared, never regenerated. Regenerating one is a deliberate, reviewable act — if this test fails, the split is wrong, not the baseline.

Case-count identity is necessary but not sufficient: CR-RG-01 also requires per-expectation diff review, which is a review gate on T11 and T12, not something this test can decide.
