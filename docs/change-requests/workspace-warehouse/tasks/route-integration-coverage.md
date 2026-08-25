---
id: T14
title: 'Cover entry, refusal, landing, not-found and no-eviction end to end'
layer: 'tests'
deps: ['T6', 'T7', 'T8', 'T10']
acs:
  [
    'CR-AC-05',
    'CR-AC-06',
    'CR-AC-07',
    'CR-AC-08',
    'CR-AC-16',
    'CR-AC-20',
    'CR-AC-21',
    'CR-RG-01',
    'CR-RG-05',
  ]
source_refs: ['change.md#CH-03', 'change.md#CH-04', 'change.md#CH-10']
files_hint:
  [
    'apps/web/src/router.spec.tsx',
    'apps/web/src/test/workspace-fixtures.ts',
    'apps/web/src/test/access-fixtures.ts',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T14 — Cover entry, refusal, landing, not-found and no-eviction end to end

## Why

Several criteria are properties of the assembled route tree rather than of any one unit, and two of
them — CR-AC-05 and CR-AC-20 — are exactly the properties a later refactor would silently break
([sad §11](../sad.md#11-risks-and-open-questions) row 3, ADR 0001 § Negative). Derives from
[sad §10](../sad.md#10-verification-strategy) rows 3–5 and the Regression row.

## What

Extend `router.spec.tsx` and the shared fixtures, driving the assembled tree through
`createAppRouter({ appStore, initialEntries })`:

- **CR-AC-05** — two independent routers in one session holding two different Warehouse addresses;
  moving one does not re-point the other.
- **CR-AC-07** — a non-member address, and any address beneath it, render the non-disclosing refusal
  **at the requested address**: no redirect, no landing resolution, no stored-selection write, no
  access-projection request, no sidebar.
- **CR-AC-17** — an archived membership address renders the archived refusal.
- **CR-AC-16** — unmatched addresses, including a bookmarked `/access`, land at `/` and resolve; an
  unauthenticated actor still reaches sign-in.
- **CR-AC-20** — a Workspace-context refetch that archives W or withdraws the membership **while the
  actor is inside W** leaves them in W's view at the same address; `beforeLoad` does not re-run and
  nothing evicts them.
- **CR-AC-21** — a member of W without `ROLES:WATCH`/`USERS:WATCH` is admitted to W's access address
  and finds the surface unpopulated.
- **CR-RG-01/CR-RG-05** — every Warehouse-scoped request still names its Warehouse explicitly through
  `warehousePath`, and `/workspace`'s guard behavior is unchanged with no double redirect.

## Definition of Done

- [ ] Every bullet above is an assertion in the suite, each naming its `CR-AC-*`/`CR-RG-*` id
- [ ] The two-tab case uses two routers over one store, proving nothing shared decides which
      Warehouse a tab shows
- [ ] The no-eviction case refetches the Workspace context mid-session and asserts the actor stays
- [ ] Fixtures cover a non-member, a member, an archived membership and a foreign-Workspace id
- [ ] `pnpm --filter @warehouser/web test` is green
- [ ] lint + vet clean

## Notes

- `apps/server` and `packages/*` are untouched by the whole change request, so CR-RG-01's server half
  needs no new test — what is asserted here is the client half: the request still names its
  Warehouse, and client-side visibility stays advisory.
- Existing suites that render an authenticated route already had their `initialEntries` updated in
  T4/T6/T7; this task adds the cross-cutting cases none of them owns.
