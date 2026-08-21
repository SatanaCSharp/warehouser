---
id: T8
title: 'Pin loader and hook Permission parity in both directions'
layer: 'tests'
deps: ['T2', 'T4', 'T5']
acs: ['CR-RG-02']
source_refs:
  - 'spec.md#cr-rg-02--the-loaders-fetch-exactly-what-the-actors-admitted-surfaces-fetch'
  - 'sad.md#45-a-permission-set-is-declared-once-and-read-by-both-the-hook-and-the-loader'
files_hint:
  - 'apps/web/src/test/loader-permission-parity/loader-permission-parity.spec.ts'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T8 — Pin loader and hook Permission parity in both directions

## Why

The loaders are a second place where a Permission decides a request, and drift between a loader and
its hook is **silent** (`sad.md` §11). T2 single-sources every set that has a constant; this task is
the backstop for the one that does not — `listWorkspaceWarehouses`, which is ungated at the hook and
gated by the tab descriptor's `WAREHOUSES:WATCH` — and the standing check for all ten rows.

This is a **merge blocker**: `change.md` §6's abort threshold names CR-RG-02 as a boundary that
aborts the change if it cannot be pinned by a test.

## What

Add `src/test/loader-permission-parity/loader-permission-parity.spec.ts` — its own directory, because
it spans four owners and none of them is the subject
([`placing-web-tests.md`](../../../system/guides/placing-web-tests.md) §3). Header comment states
why.

For every row of [CR-RG-02's table](../spec.md#cr-rg-02--the-loaders-fetch-exactly-what-the-actors-admitted-surfaces-fetch),
compare the loader's dispatch condition against the hook `skip` or tab descriptor it reproduces, and
fail on drift in **either** direction. The table distinguishes three gate kinds — unconditional, tab
descriptor, hook skip — and conflating them is the mistake this file exists to catch.

Five `workspaceRoute` rows (`getWorkspaceContext`, `listWorkspaceWarehouses`, `listWorkspaceUsers`,
`useWorkspaceMembers`, `useWorkspaceRoles`, `useWorkspacePermissionCatalogue` — `listWorkspaceUsers`
counted once) and four `accessRoute` rows (`getCurrentAccess`, `useAccessRoles`, `useAccessMembers`,
`useAccessPermissions`).

## Definition of Done

- [ ] Every CR-RG-02 row has a case, and each case fails if the loader's condition drifts from its
      hook `skip` or tab descriptor in either direction.
- [ ] `listWorkspaceWarehouses` is covered against the **tab descriptor** at
      `WorkspaceAdministration.tsx:56-58`, not against a hook skip it does not have.
- [ ] A case asserts an actor with `ROLES:ASSIGN` but **not** `ROLES:WATCH` still receives Roles and
      Members — the narrowing regression, which is the likelier mistake here.
- [ ] A case asserts the one intended widening and only it: `useAccessPermissions`'s set is
      `rolesTabPermissions`; no other set changed membership.
- [ ] `listWorkspaceUsers` is asserted to be **one** dispatch, one cache entry.
- [ ] `pnpm --filter @warehouser/web lint` and `test` clean.

## Notes

- **Merge blocker.** If a row cannot be pinned, `change.md` §6 says abort rather than ship.
- Runs beside the whole removal phase — it depends only on T2, T4 and T5, not on T7.
- If the workspace-side tab-descriptor extraction ever lands
  ([`sad.md` §11](../sad.md#open-questions)), roughly half of this file retires and CR-RG-02's
  structural row shrinks to the access sets. Deliberately deferred: the descriptors also carry
  translated labels, so the extraction is not free.
