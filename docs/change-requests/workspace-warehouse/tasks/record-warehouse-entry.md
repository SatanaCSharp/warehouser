---
id: T8
title: 'Record the entered Warehouse as the stored selection without blocking entry'
layer: 'app'
deps: ['T4']
acs: ['CR-AC-09']
source_refs:
  ['change.md#CH-05', 'docs/features/workspaces/spec.md#ac-03-us-02--happy']
files_hint:
  [
    'apps/web/src/modules/warehouse/hooks/useRecordWarehouseEntry.ts',
    'apps/web/src/modules/warehouse/hooks/useRecordWarehouseEntry.spec.tsx',
    'apps/web/src/shared/layouts/WarehouseLayout.tsx',
    'apps/web/src/store/middleware/api-error.middleware.ts',
    'apps/web/src/store/middleware/api-error.middleware.spec.ts',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T8 — Record the entered Warehouse as the stored selection without blocking entry

## Why

The stored-selection write moves out of the switcher and onto entry itself, so **every** entry path —
switcher row, Enter action, typed address, restored session — records identically, instead of only
the one path that went through the control. Derives from
[spec §CR-AC-09](../spec.md#5-acceptance-criteria), [sad §4.7](../sad.md#4-solution-strategy) and
[sad §6.2](../sad.md#62-entering-a-warehouse-by-any-path-cr-ac-02-cr-ac-05-cr-ac-07-cr-ac-09-cr-ac-14-cr-ac-17)
step 7.

## What

- `modules/warehouse/hooks/useRecordWarehouseEntry.ts` — compares the entered Warehouse against
  `effectiveWarehouseId` (the only stored selection the web can observe) and dispatches
  `setActiveWarehouse` **only** when they differ. Fire-and-forget, issued after render, awaited by no
  route, guard or gate.
- `shared/layouts/WarehouseLayout.tsx` — mount the hook only in the `entered` branch, never around a
  refusal.
- `store/middleware/api-error.middleware.ts` — add a named silent-failure allowlist whose **only**
  member is `setActiveWarehouse`, so a failed entry record raises no alert over an otherwise working
  Warehouse view. Every other normalized API failure keeps alerting.

## Definition of Done

- [ ] Hook unit test: entering a Warehouse the effective value already names writes nothing, on first
      render and on refresh/re-entry
- [ ] Hook unit test: entering a different Warehouse issues exactly one write
- [ ] Hook unit test: the write is never awaited by the route, and rendering does not wait on it
- [ ] Hook unit test: a rejected write leaves the actor in the Warehouse with exactly their
      membership's capabilities, raises no error state, and retries nothing
- [ ] Hook unit test: the hook does not mount around a refusal
- [ ] Middleware unit test: `setActiveWarehouse` failures raise no alert, and every other rejected
      endpoint still does
- [ ] lint + vet clean

## Notes

- The recorded value **grants nothing**: it is never read by any gate, guard or predicate, never
  marks a switcher row, and is never an authorization input (CR-AC-09, spec §6 "Authority
  staleness"). Its only consumer is CR-AC-08 rule (2) in T7.
- This hook is one of the three allowlisted `effectiveWarehouseId` call sites (T13).
- `store/middleware/api-error.middleware.ts` is **not** listed in `change.md`'s `affected_sources`;
  it is recorded in [sad §5 Modified](../sad.md#modified) and [sad §11](../sad.md#11-risks-and-open-questions)
  row 1 as a source to add at the next edit of that document — a documentation follow-up for the Tech
  Lead, not a blocker for this task. This is the one documented exception to
  [web error handling](../../../system/guides/web-error-handling.md)'s single alert path.
