---
id: T17
title: 'Remove the fourteen orphaned translation keys'
layer: 'ui'
deps: ['T16']
acs: ['CR-AC-12']
source_refs:
  - 'change.md#3-override-map CH-12'
  - 'spec.md#cr-ac-12-cr-us-01-ch-12--structural'
files_hint:
  - 'apps/web/public/locales/en/access.json'
  - 'apps/web/public/locales/en/warehouse.json'
  - 'apps/web/public/locales/en/workspace.json'
  - 'apps/web/public/locales/uk/access.json'
  - 'apps/web/public/locales/uk/warehouse.json'
  - 'apps/web/public/locales/uk/workspace.json'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T17 — Remove the fourteen orphaned translation keys

## Why

Rollout step 5 of [`change.md` §6](../change.md#6-rollout), last before the documentation
reconciliation. Each removed skeleton named itself with its own translated loading label; once the
components are gone those keys are orphans, and leaving them invites an eighth waiting affordance to
be written against one.

## What

Remove **seven keys per language, fourteen total**, from both `en` and `uk`:

| File             | Keys                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `access.json`    | `loading`, `members.loading`, `workspaceRoles.loading`, `workspaceMembers.loading`, `workspacePermissions.loading` |
| `warehouse.json` | `warehouses.loading`                                                                                               |
| `workspace.json` | `loading`                                                                                                          |

Verified present in `en` at `access.json:4,31,171,228,286`, `warehouse.json:6`, `workspace.json:2`
and mirrored in `uk` ([`sad.md` §7](../sad.md#7-data-and-interface-impact)). Update
`src/test/locale-baseline.json` to match.

## Definition of Done

- [ ] All seven keys are absent from **both** `en` and `uk`.
- [ ] Both languages carry the **identical key set** afterwards
      ([`adding-and-maintaining-web-localization.md`](../../../system/guides/adding-and-maintaining-web-localization.md)).
- [ ] `common.json`'s `shell.landing.pendingLabel` — which `RoutePendingState.tsx:22` already reads —
      is the only waiting copy the application renders (CR-AC-12).
- [ ] `test/locale-baseline.json` and its owning spec are updated and green.
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- `change.md` CH-12 cites `common.json:21` for `shell.landing.pendingLabel`; the key is on **line 22**
  at `baseline_revision` (`sad.md` §7). Do not remove or move it.
- No loader introduces any copy of its own.
