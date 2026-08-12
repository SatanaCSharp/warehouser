---
id: T31
title: 'Add the Workspace load smoke test and authorization timing coverage'
layer: 'tests'
deps: ['T24', 'T25']
acs: []
files_hint: ['apps/server/src/workspaces/workspaces.load.spec.ts']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T31 — Add the Workspace load smoke test and authorization timing coverage

## Why

[spec §6](../spec.md#6-non-functional-requirements) sets five measured targets — both authorization
stages ≤50 ms p95, Workspace reads ≤250 ms p95, Workspace mutations ≤500 ms p95, Warehouse selection
≤250 ms p95, and ≥50 Workspace operations per second per instance for ten minutes — and names
"Automated load smoke test" and "Structured server timing logs" as their measurement. One of those
targets is structural: the Warehouse authorization stage must not grow with the number of Warehouses
a member belongs to.

## What

Add a load smoke spec exercising a representative mix of Workspace-level operations (context read,
Workspace Role and Member reads, a rename, a Role assignment, a Warehouse create/rename, a selection
write) against a `persistWorkspaceGraph` fixture, sustaining the throughput target and reporting p95
per stage from the structured fields the existing `withOperationTiming` helper already emits. Add the
membership-count independence check: run the Warehouse authorization stage against members holding 1
and ~50 memberships and compare.

## Definition of Done

- [ ] The test sustains ≥50 Workspace operations per second per running instance for ten minutes and
      reports pass/fail against that target.
- [ ] p95 is reported and asserted for: Workspace authorization, Warehouse authorization, Workspace
      read, Workspace mutation and Warehouse selection.
- [ ] The Warehouse authorization stage p95 at ~50 memberships is within noise of the 1-membership
      case, proving independence from membership count.
- [ ] Timing evidence comes only from the existing `withOperationTiming` structured fields — **no**
      telemetry, metrics client or exporter is added.
- [ ] The test is opt-in for local runs but wired into the release gate, following the
      `users-management` load-smoke precedent.
- [ ] lint + vet clean.

## Notes

`sad.md` §8 also asks for migration apply/revert verification against the real development database
and invariant-reconciliation output; the first is owned by [T1](./promote-workspace-authority-schema.md)
and [T2](./promote-warehouse-rekey-migrations.md), the second is reported through structured
operational logs and is never silently repaired.
