---
id: T1
title: 'Pin baseline_revision on a clean working tree'
layer: 'docs'
deps: []
acs: ['CR-AC-11', 'CR-RG-07']
files_hint: ['docs/change-requests/modules-level-refactor/change.md']
source_refs: []
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T1 — Pin `baseline_revision` on a clean working tree

## Why

`baseline_revision` is the single "before" that [CR-AC-11](../spec.md#cr-ac-11-cr-us-04-ch-s1-ch-s2-ch-s3-ch-s4--contract-identity),
[CR-RG-04](../spec.md#cr-rg-04--user-visible-copy-is-unchanged), [CR-RG-05](../spec.md#cr-rg-05--the-effectivewarehouseid-restriction-still-holds)
and the [spec §6](../spec.md#6-non-functional-requirements) cost rows all compare against. Its value in
`change.md` frontmatter is marked provisional. [sad §11 R7](../sad.md#risks) names the hazard: this
branch carries in-flight `WarehouseSwitcher.tsx` work, and capturing a baseline against a dirty tree
contaminates the "before" side of every identity comparison in the request.

## What

- Commit or land the in-flight `apps/web/src/shared/layouts/WarehouseSwitcher.{tsx,spec.tsx}` work so it
  sits **before** the baseline, where [CR-RG-07](../spec.md#cr-rg-07--the-web-composition-layer-is-unchanged)
  requires it — this request must never appear to have caused that diff.
- Confirm the tree is clean, then replace the provisional SHA in `change.md`'s `baseline_revision`
  frontmatter with the branch tip, dropping the `provisional` comment.
- Record in the same edit that no later task may re-pin it.

## Definition of Done

- [ ] `git status --porcelain` is empty at the moment the SHA is read.
- [ ] `change.md` frontmatter `baseline_revision` holds that branch-tip SHA with no `provisional` note.
- [ ] `git show --stat <baseline_revision>` includes the `WarehouseSwitcher` work, proving it precedes
      the baseline rather than following it.
- [ ] lint clean.

## Notes

Nothing else in the request may run before this: T2's three baselines are captured _at_ this revision,
so re-pinning afterwards invalidates them. This is the one task whose output is a single frontmatter
value, and it is deliberately its own commit so the SHA it names is unambiguous.
