---
id: T6
title: 'Force-mount every admitted tab panel so loader-filled entries keep a subscriber'
layer: 'ui'
deps: ['T4', 'T5']
acs: ['CR-AC-03']
source_refs:
  - 'spec.md#cr-ac-03-cr-us-02-ch-03--behavioral'
  - 'sad.md#44-subscribe-false-plus-force-mounted-panels'
files_hint:
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.tsx'
  - 'apps/web/src/modules/workspace/components/WorkspaceAdministration.spec.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/AccessWorkspace.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/AccessWorkspace.spec.tsx'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T6 — Force-mount every admitted tab panel

## Why

The loaders dispatch with `subscribe: false`, so a loader-filled entry has no subscriber of its own
and RTK Query starts its 60-second `keepUnusedDataFor` timer immediately. Left alone, an
admitted-but-unopened tab's entry would be evicted after a minute's dwell — and with no readiness
term left after CH-09 to distinguish "in flight" from "empty", that tab would then paint
`workspaceRoles.empty` or `members.empty` for a dataset that is merely loading.

`subscribe: false` and force-mounting are one decision
([`sad.md` §4.4](../sad.md#44-subscribe-false-plus-force-mounted-panels)); this task is CR-AC-03's
third clause.

## What

Set `shouldForceMount` on every admitted `Tabs.Panel` on both multi-tab destinations —
`WorkspaceAdministration.tsx:143` and `AccessWorkspace.tsx:108`. React Aria's `TabPanel` mounts a
force-mounted panel **inert but present**, so each admitted tab's own query hook mounts and
subscribes on first paint and holds the entry the loader filled for the destination's lifetime.

Only _admitted_ panels — the tab shell is still absent entirely for an actor admitted to no tab
(`WorkspaceAdministration.tsx:113-117`), unchanged from `baseline_revision`.

## Definition of Done

- [ ] Every admitted `Tabs.Panel` on both destinations sets `shouldForceMount`; the unadmitted-actor
      path is unchanged.
- [ ] A colocated spec dwells past `keepUnusedDataFor` on `/workspace`, switches to an admitted tab,
      and asserts **no request is issued and no empty message appears** — CR-AC-03's falsifier.
- [ ] A spec asserts unselected panels remain `inert`, so their content is not reachable by keyboard
      or screen reader (`sad.md` §8, Accessibility).
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- **Expected fallout** (`sad.md` §11 risk row 3): all admitted tabs' content is now in the DOM
  simultaneously, so specs querying by role and accessible name may match across tabs. Scope those
  queries to the panel. Do **not** rename an accessible name to disambiguate.
- Shares a lane with T2 and T15 (`AccessWorkspace.tsx` and the access tabs) and with T12
  (`WorkspaceAdministration.tsx`). T12 depends on T7 which depends on this task, so the order holds.
