---
id: T17
title: 'Produce and compare the CR-RG-05 normalized chunk manifest'
layer: 'tests'
deps: ['T13', 'T15', 'T16']
acs: ['CR-RG-05']
files_hint: ['apps/web/src/test/baselines', 'apps/web/vite.config.ts']
source_refs: []
owner: 'YuriiH'
estimate: 'M'
status: 'done'
---

# T17 — Produce and compare the CR-RG-05 normalized chunk manifest

## Why

[`spec.md` CR-RG-05](../spec.md#cr-rg-05--bundle-shape) and `spec.md` §6's bundle NFR. `vite.config.ts` declares no `manualChunks`, so chunk filenames are content-hashed and a raw `dist/assets` listing is not comparable — the normalized manifest is the only valid comparison artifact.

## What

Build at `HEAD` with `pnpm --filter @warehouser/web build`, emit the Rollup output map, and normalize it the same way T1 normalized the baseline: strip content hashes from chunk names, rewrite every moved source path to its post-move path, sort. Diff against the committed baseline.

The criterion passes when that diff is **empty**: no new eager chunk, every lazy `import('./page')` route boundary preserved, and no `index.ts` barrel introduced for any module.

## Definition of Done

- [ ] the normalized `HEAD` manifest diffs empty against the baseline
- [ ] no new eager chunk appears and every lazy route boundary is preserved
- [ ] no `index.ts` barrel exists in any module — the enumerated surface declaration is still the mechanism
- [ ] the path-rewriting step is applied to the `HEAD` side only, and is reviewable as a explicit mapping rather than a fuzzy match
- [ ] `pnpm --filter @warehouser/web build` clean

## Notes

**If T1 could not produce the baseline build, this criterion is `unverified`, not `satisfied`** (`spec.md` §5.1, `sad.md` R5). Record the actual status in the review. A green unit suite does not discharge it, and neither does a `HEAD`-only manifest.

Sequenced last among the web tasks so it measures the finished tree.
