---
id: T13
title: 'Enforce the effectiveWarehouseId allowlist with an architecture check'
layer: 'wiring'
deps: ['T6', 'T8', 'T9']
acs: ['CR-AC-06', 'CR-AC-09']
source_refs: ['change.md#CH-04', 'change.md#CH-05']
files_hint: ['apps/web/eslint.config.mjs']
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T13 — Enforce the effectiveWarehouseId allowlist with an architecture check

## Why

The first quality goal of this design is that the Warehouse under authorization is never ambient, and
the ESLint allowlist is what keeps that true after the change ships. Derives from
[spec §6 "Warehouse-scope coverage"](../spec.md#6-non-functional-requirements),
[spec §7 "Implicit Warehouse resolution"](../spec.md#7-metrics--kpis) and
[sad §8 Security](../sad.md#security-and-privacy).

## What

`apps/web/eslint.config.mjs` gains a restriction failing on **any** `effectiveWarehouseId` reference
in the non-test sources of `apps/web/src`, outside an explicit allowlist of exactly three files:

1. `src/guards/landing.guard.ts` — the landing resolver (T7), CR-AC-08 rule (2)
2. `src/shared/layouts/WarehouseSwitcher.tsx` — the switcher's retained-message condition (T9)
3. `src/modules/warehouse/hooks/useRecordWarehouseEntry.ts` — the entry write (T8), which compares the
   entered Warehouse against it

## Definition of Done

- [ ] `pnpm --filter @warehouser/web lint` passes on the change with exactly those three files
      referencing the value
- [ ] A deliberately added fourth reference in a non-test source makes lint **fail**, verified once
      and then reverted
- [ ] Test sources are excluded from the restriction
- [ ] The allowlist is written as three explicit file paths, not a directory or a glob

## Notes

This task is scheduled after its three allowlisted call sites exist, so the rule is written against
reality rather than against an intention. If a fourth call site turns out to be needed, that is a
specification change — spec §6 fixes the number at three — not a lint exemption.
