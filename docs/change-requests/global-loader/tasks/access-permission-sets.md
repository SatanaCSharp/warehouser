---
id: T2
title: 'Single-source the access Permission sets and apply the one intended widening'
layer: 'ui'
deps: []
acs: ['CR-RG-02']
source_refs:
  - 'spec.md#cr-rg-02--the-loaders-fetch-exactly-what-the-actors-admitted-surfaces-fetch'
  - 'sad.md#45-a-permission-set-is-declared-once-and-read-by-both-the-hook-and-the-loader'
files_hint:
  - 'apps/web/src/modules/access/utils/access-permission-sets.ts'
  - 'apps/web/src/modules/access/hooks/queries/useAccessRoles.ts'
  - 'apps/web/src/modules/access/hooks/queries/useAccessMembers.ts'
  - 'apps/web/src/modules/access/hooks/queries/useAccessPermissions.ts'
  - 'apps/web/src/modules/access/components/access-workspace/AccessWorkspace.tsx'
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T2 — Single-source the access Permission sets and apply the one intended widening

## Why

The loaders become a second place where a Permission decides a request, and drift between a loader's
map and its hook's `skip` is silent — the exact failure
[CR-RG-02](../spec.md#cr-rg-02--the-loaders-fetch-exactly-what-the-actors-admitted-surfaces-fetch)
exists to catch. [`sad.md` §4.5](../sad.md#45-a-permission-set-is-declared-once-and-read-by-both-the-hook-and-the-loader)'s
answer is that neither owns the set: a named constant does, and both read it.

This task lands before T5 so the access loader has one place to read from rather than a copy.

## What

Add `modules/access/utils/access-permission-sets.ts` — a lookup table, so `utils/` per
[`placing-web-hooks.md`](../../../system/guides/placing-web-hooks.md) §3 — exporting
`rolesTabPermissions`, `rolesReadPermissions` and `membersReadPermissions`.

Point the existing readers at it. **The gate itself does not move**: `useAccessRoles` still applies
its own `skip` (`placing-web-hooks.md` §2 — "a gate belongs to the read it gates"), it just names the
set from one place. `AccessWorkspace`'s Roles-tab descriptor reads `rolesTabPermissions`.

Apply **the one intended widening**: `useAccessPermissions`'s skip set is redefined as
`rolesTabPermissions` itself. The old three (`ROLES:WATCH`, `ROLES:CREATE`, `ROLES:UPDATE`) are a
subset, so this widens by `ROLES:ASSIGN`, `ROLES:DELETE` and `WAREHOUSE_MANAGER_ROLE:REASSIGN` —
exactly and only what CR-RG-02 permits. That makes **tab admission implies the dataset arrives** an
identity a reader can see rather than an invariant a comment claims, which is what CR-RG-05's
reachability argument rests on.

## Definition of Done

- [ ] The three constants are declared once and the three hooks plus `AccessWorkspace`'s tab
      descriptor read them; no Permission literal for these sets remains at a call site.
- [ ] `useAccessPermissions`'s skip set is `rolesTabPermissions` — six Permissions, not three.
- [ ] A spec asserts a `ROLES:ASSIGN`-only actor is now inside the catalogue's set, and that
      `rolesReadPermissions` (8) and `membersReadPermissions` (7) changed membership by nothing.
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- This is **the only Permission-condition change in the whole request** (`spec.md` §3, §6.1,
  CR-RG-07). Nothing else may move.
- Widening and narrowing are both regressions. Narrowing is the likelier mistake: an actor holding
  `ROLES:ASSIGN` but not `ROLES:WATCH` receives Roles and Members today, and writing the sets against
  the single watch Permissions would silently take them away — breaking the Members list's Role-name
  lookup at `MemberList.tsx:116`.
- The catalogue carries Permission **names** only, no Workspace or member data, and route guards stay
  advisory: the server independently authorizes every request, so the widening cannot admit an actor
  the server would refuse (`spec.md` §6.1).
- The workspace-side tab-descriptor Permissions are deliberately **not** extracted here — they also
  carry translated labels, so the extraction is not free. T8 covers that gap by test
  ([`sad.md` §11](../sad.md#open-questions)).
- Shares a lane with T6 and T15 on `AccessWorkspace.tsx` / the tab components; both depend on this
  task.
