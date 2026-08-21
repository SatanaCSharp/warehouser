---
id: T14
title: 'Carry the unresolved actor in the type and stop replacing painted member rows'
layer: 'ui'
deps: ['T7']
acs: ['CR-AC-08', 'CR-AC-10', 'CR-AC-11', 'CR-RG-01']
source_refs:
  - 'change.md#3-override-map CH-10'
  - 'change.md#3-override-map CH-11'
  - 'spec.md#cr-rg-01--self-row-gating-never-evaluates-against-an-unresolved-actor'
  - 'sad.md#49-the-unresolved-actor-is-carried-by-a-type-not-a-branch'
files_hint:
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberDirectory.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberList.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberList.spec.tsx'
  - 'apps/web/src/modules/access/components/access-workspace/components/members/MemberRow.tsx'
  - 'apps/web/src/modules/auth/sign-out/components/SignOutButton.spec.tsx'
owner: 'YuriiH'
estimate: 'M'
status: 'todo'
---

# T14 — Carry the unresolved actor in the type and stop replacing painted member rows

## Why

**This is the one override in the request that is unsafe if unproven.** CH-11 removes
`MemberDirectory.tsx:122`'s `isLoading={isRefreshing || actor === null}` guard, and that guard is
**live**, not dead: `SignOutButton.tsx:26-27` dispatches `authBecameAnonymous()` _before_ awaiting
`navigate`, so `selectCurrentUser` becomes `null` while the list is still mounted.

[`sad.md` §4.9](../sad.md#49-the-unresolved-actor-is-carried-by-a-type-not-a-branch) replaces the
branch with the **type**, and this task also lands CH-10: a background refetch must leave the rows
the actor is reading on screen.

## What

- `MemberListProps.actorUserId` widens from `string` to `string | undefined`, and
  `MemberDirectory.tsx:121`'s `?? ''` fallback is removed. An unresolved actor must not be
  expressible as "no row is self".
- `MemberRow` suppresses **every** destructive control while `actorUserId` is undefined.
- `MemberListProps` declares no `isLoading`; `MemberDirectoryProps` declares no `isRefreshing`.
- `MemberListStatus` narrows to `'empty' | 'ready' | 'searchEmpty'` (CR-AC-08) — it gains **no** state
  for an unresolved actor; the guarantee is carried by the prop type and the row, not by a
  list-level branch.
- CH-10: a background refetch of an already-painted dataset leaves the rows on screen. The
  force-mounted hooks from T6 are the subscribers RTK Query refetches in place, with `data`
  retained.

Widening the type is the mechanism, not a nicety. Leaving `actorUserId` as `string` would let
`MemberList.tsx:114`'s `isSelf={member.userId === actorUserId}` keep type-checking while evaluating
`false` for every row — CR-RG-01's exact forbidden outcome, reached silently.

## Definition of Done

- [ ] `actorUserId` is `string | undefined`, the `?? ''` fallback is gone, and `MemberRow` suppresses
      every destructive control while it is undefined.
- [ ] `MemberListProps` declares no `isLoading`; `MemberDirectoryProps` declares no `isRefreshing`;
      `MemberListStatus` is exactly `'empty' | 'ready' | 'searchEmpty'`.
- [ ] **Merge blocker:** a spec drives the **sign-out window specifically** — dispatch
      `authBecameAnonymous()` with the list mounted, then assert no row renders as not-self and no
      destructive control is offered against an unresolved actor id. `requireAuth` covers route
      entry, not this teardown, so it does not substitute.
- [ ] A spec invalidates the members tag on a painted list and asserts the previously painted rows
      remain on screen with no skeleton or spinner replacing them (CR-AC-10). Its route-level clause
      — `RoutePendingState` never mounts — is pinned in T7.
- [ ] `members.empty` and `members.searchEmpty` still render in their own cases (CR-RG-05).
- [ ] `pnpm --filter @warehouser/web lint`, `test` and `build` clean.

## Notes

- **Merge blocker.** [`change.md` §6](../change.md#6-rollout)'s abort threshold names CR-RG-01: if it
  cannot be pinned by a test, the change aborts rather than ships. The test is not a nice-to-have.
- CR-RG-01 is a **correctness** boundary, not a security one — the actor id it protects is already
  client-side state (`spec.md` §6.1).
