---
id: T18
title: 'Report Address Drift and serve the by-line split from the read repository'
layer: 'app'
deps: [T13, T16]
acs: ['AC-11b', 'AC-18', 'AC-18a', 'AC-22']
files_hint:
  - 'apps/server/src/purchase-drafts/usecases/queries/'
  - 'apps/server/src/shared/domain/repositories/purchase-draft-read.repository.ts'
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T18 — Report Address Drift and serve the by-line split from the read repository

## Why

No studied product notices when the customer's address changes after the purchase document is committed — this is where the feature spends its novelty. A Drift Signal is a **value comparison, never stored**, which is what makes it fresh on the next read by construction rather than by a repair job. Derives from [spec.md §5 AC-18, AC-18a, AC-22](../spec.md) and [sad.md §4, §6.9](../sad.md).

## What

Extend `PurchaseDraftReadRepository` to compute Address Drift inside its existing query by comparing each captured Demand Snapshot address against the Customer Order now, joining the Address Drift signals `ordering` already reports. Add the by-line projection that returns each frozen line under the Delivery Mode that places it.

## Definition of Done

- [ ] A redirection is reflected in the drift of every linked frozen draft **on the next read**; 0 reads of a superseded address.
- [ ] Drift stops being reported once the order is redirected back to the address frozen for it.
- [ ] Every frozen value of the draft is left exactly as it was — asserted, not assumed.
- [ ] Nothing about a Drift Signal is stored and no job repairs one.
- [ ] An integration test covers many links per draft and many drafts per Warehouse.
- [ ] The by-line projection places each line by its own delivery mode, including a draft holding both.
- [ ] lint + vet clean.

## Notes

Where drift **surfaces** is presentation and belongs to T23: on the draft list for a direct line, inside the opened draft for a via-warehouse line (AC-18a). This task decides only that it is reported.
