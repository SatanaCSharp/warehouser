---
id: T1
title: 'Capture the three `baseline_revision` comparison artifacts'
layer: 'tests'
deps: []
acs: ['CR-RG-01', 'CR-RG-05', 'CR-RG-07']
files_hint: ['apps/web/src/test/baselines']
source_refs: []
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T1 — Capture the three `baseline_revision` comparison artifacts

## Why

Every later gate compares against `42f1205`, and [`test-plan.md` §Test data](../test-plan.md) requires the comparison basis to be **committed and compared, never regenerated to make a gate pass**. Capturing it after the tree has moved is not a baseline.

## What

Create `apps/web/src/test/baselines/` holding three artifacts, each produced from `baseline_revision = 42f1205d552f8284f8ec57358ad9022340b5f76e` and nothing else:

- `warehouses-tab-cases.json` — the 39 case names of `WarehousesTab.spec.tsx` at the baseline, plus the total. Extracted from the baseline file's `describe`/`it` strings, grouped by the ten `describe` blocks [`sad.md` §5.4](../sad.md#54-the-ch-w5-spec-split--fixes-the-cr-rg-01-drift-boundary) tabulates.
- `module-chunk-manifest.json` — the normalized module→chunk map from `pnpm --filter @warehouser/web build` at the baseline: content hashes stripped from chunk names, entries sorted. Path rewriting to post-move paths happens at comparison time (T17), not here.
- `neighbour-trees.json` — a per-file digest of `apps/web/src/modules/access`, `apps/web/src/modules/home`, `apps/web/src/modules/auth`, `apps/server` and `packages/contracts` at the baseline, for the CR-RG-07 guard.

Add the capture script alongside them so each artifact is reproducible rather than hand-transcribed.

## Definition of Done

- [ ] `warehouses-tab-cases.json` totals exactly 39 and its ten groups match `sad.md` §5.4's first column
- [ ] `module-chunk-manifest.json` is byte-stable across two consecutive baseline builds — i.e. hash stripping and sorting actually normalize it
- [ ] `neighbour-trees.json` covers all five trees CR-RG-07 fences
- [ ] re-running the capture script at `42f1205` reproduces all three byte-for-byte
- [ ] `pnpm --filter @warehouser/web lint` clean

## Notes

**If the baseline build cannot be produced**, `module-chunk-manifest.json` is absent and CR-RG-05 is **unverified, not satisfied** (`spec.md` §5.1, `sad.md` R5). Record that outcome here rather than substituting a `HEAD` build. The other two artifacts do not need a build and must still land.

This task deliberately runs parallel to the whole documentation lane — it touches no file any other task touches.
