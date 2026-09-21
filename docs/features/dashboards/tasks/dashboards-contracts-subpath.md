---
id: T3
title: 'Add the @warehouser/contracts/dashboards subpath with the eight Panel response schemas and both Vite aliases'
layer: 'ports'
deps: []
acs: ['AC-03', 'AC-07', 'AC-08a', 'AC-12', 'AC-16', 'AC-17a', 'AC-20', 'AC-20a']
files_hint:
  - 'packages/contracts/src/dashboards/'
  - 'packages/contracts/src/index.ts'
  - 'packages/contracts/package.json'
  - 'apps/web/vite.config.ts'
owner: 'Tech Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Add the @warehouser/contracts/dashboards subpath with the eight Panel response schemas and both Vite aliases

> **Blocked by:** —
> **Satisfies:** AC-03, AC-07, AC-08a, AC-12, AC-16, AC-17a, AC-20, AC-20a — see [spec.md §5](../spec.md)
> **Owner:** Tech Lead · **Estimate:** M · **Layer:** `ports`

## Why

Eight `GET` endpoints need their response shapes, and
[`contracts/openapi.yaml`](../contracts/openapi.yaml) already defines them. Every exclusion count is
a **field of the Panel's response** rather than a second read or a client derivation, which is the
only way `spec.md` §6's 100% exclusion-accounting target can hold ([sad.md §4](../sad.md) point 3).

## What

A new `packages/contracts/src/dashboards/` subpath: eight response schemas and the two shared value
shapes (a bucket, an exclusion count). **No request bodies** — every read is a `GET` whose only
input is the route's `warehouseId` or the session's Workspace.

Plus **two** entries in `apps/web/vite.config.ts` `resolve.alias`: the
`@warehouser/contracts/dashboards` mapping **and** the bare `dashboards` mapping that contracts' own
`baseUrl: src` imports require.

## Definition of Done

- [ ] The eight schemas match their `openapi.yaml` components field for field, including
      `AgeBand`, `UrgencyBand`, `ArrivalTimingBucketKind`, `ArchivedWarehouseCount` and both
      exclusion shapes
- [ ] Every exclusion count is a **required** field, never optional
- [ ] Both Vite aliases are registered
- [ ] A contract-parity spec asserts each exported schema against its `openapi.yaml` component and
      **fails** when one drifts — demonstrated by a deliberate temporary edit
- [ ] `pnpm --filter @warehouser/web build` succeeds
- [ ] `oxlint --type-aware --max-warnings=0` clean over every staged file, and the
      commit passes the repository's Git hooks without `--no-verify`

## Notes

**Registering only the first alias leaves `pnpm --filter @warehouser/web build` broken while every
test stays green** — this is how it was missed once already on `22-ordering` ([sad.md §7](../sad.md)).
The build is not optional in this task's gate.

The parity spec exists because a worktree cannot gate a contracts change through `dist` resolution
alone; it is the regression control that makes the drift visible in-repo.
