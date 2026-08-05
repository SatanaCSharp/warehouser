---
id: T9
title: 'Expose scoped access read endpoints'
layer: 'ports'
deps: ['T3', 'T5']
acs: ['AC-15', 'AC-16', 'AC-20', 'AC-21', 'AC-22']
files_hint:
  [
    'packages/contracts/src/access',
    'packages/contracts/package.json',
    'apps/server/src/access/usecases/queries',
    'apps/server/src/access/rest/access-read.controller.ts',
    'apps/server/src/access/rest/access-read.spec.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Expose scoped access read endpoints

## Why

The reads in [spec AC-20–AC-22](../spec.md), [sad.md §6.5](../sad.md), and [openapi.yaml](../contracts/openapi.yaml) split Role/catalogue authority from member/assignment authority.

## What

Fold the access read contracts into their first server implementation. Add current capability, Roles, Permissions, and members queries/controllers with strict Zod adapters, stable cursors, bounded deterministic pages, Permission metadata, and actor-derived Warehouse scope.

## Definition of Done

- [ ] Contract tests cover strict schemas, cursor exclusivity, limit 1–100/default 20, ordering, and safe projections.
- [ ] `ROLES:WATCH` gates Roles/catalogue and `USERS:WATCH` gates members/assignments independently.
- [ ] REST tests prove current-Warehouse scoping and non-disclosing denial/not-found behavior.
- [ ] Current-access response contains only the web-safe capability projection.
- [ ] Contract/server tests, lint, and static checks pass.

## Notes

No endpoint accepts a Warehouse ID. This files lane overlaps T10 through `packages/contracts/src/access`, so implementation must serialize them.
