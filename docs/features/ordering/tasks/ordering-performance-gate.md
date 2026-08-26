---
id: T22
title: 'Add the ordering load smoke and the structured timing assertions for the section 6 latency targets'
layer: 'tests'
deps: ['T7', 'T11', 'T16']
acs: []
files_hint: ['apps/server/src/test/ordering-load-smoke.integration.spec.ts']
owner: 'Tech Lead'
estimate: 'S'
status: 'done'
---

# T22 — Add the ordering load smoke and the structured timing assertions for the section 6 latency targets

> **Blocked by:** [T7](./items-rest-surface.md), [T11](./customer-orders-rest-surface.md), [T16](./purchase-drafts-rest-surface.md) · **Layer:** `tests` · **Owner:** Tech Lead · **Estimate:** S
> **Acceptance criteria:** — (traced to `spec.md` §6/§6.1, not §5 — see Notes)

## Why

Five of the eleven [spec §6](../spec.md) targets are latency and throughput figures that only a running surface can demonstrate, and [sad §10](../sad.md) names the load smoke as required evidence.

## What

- Add `apps/server/src/test/ordering-load-smoke.integration.spec.ts`, following `apps/server/src/workspaces/workspaces-load-smoke.integration.spec.ts`.
- Seed the `spec.md` §1 scale — roughly 2 000 Items, 5 000 Unfulfilled Customer Orders and 250 open Purchase Drafts per Warehouse — **plus accumulated Closed drafts**.
- Assert the structured Pino timing fields emitted through the existing `shared/logger/with-operation-timing.ts`. Add no telemetry.

## Definition of Done

- [ ] The smoke sustains ≥ 50 protected operations per second per instance for ten minutes
- [ ] Authorization stage p95 ≤ 50 ms per protected operation the feature introduces
- [ ] The consolidated demand read p95 ≤ 400 ms at the §1 scale **with accumulated Closed drafts**, returning Demand Lines, Coverage and On-hand Quantity whole rather than paged
- [ ] Item and draft reads p95 ≤ 250 ms; every mutation p95 ≤ 500 ms
- [ ] The structured timing fields are present on each measured operation, and no telemetry is added
- [ ] lint + vet clean

## Notes

- Measured excluding client network time, as `spec.md` §6 states.
- This task carries no `acs` entry: the targets are `spec.md` §6 NFRs, not §5 acceptance criteria.
