---
id: T10
title: 'Expose access mutation endpoints and normalized failures'
layer: 'ports'
deps: ['T6', 'T7', 'T8', 'T9']
acs:
  [
    'AC-03',
    'AC-04',
    'AC-05',
    'AC-06',
    'AC-06a',
    'AC-06b',
    'AC-07',
    'AC-08',
    'AC-09',
    'AC-09a',
    'AC-10',
    'AC-11',
    'AC-12',
    'AC-12a',
    'AC-13',
    'AC-14',
    'AC-14a',
    'AC-19',
  ]
files_hint:
  [
    'packages/contracts/src/access',
    'packages/contracts/package.json',
    'packages/shared-types/src/enums/error-code.ts',
    'apps/server/src/access/rest/access-mutation.controller.ts',
    'apps/server/src/access/rest/access-mutation.spec.ts',
    'apps/server/src/access/access.module.ts',
    'apps/server/src/app.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'L'
status: 'todo'
---

# T10 — Expose access mutation endpoints and normalized failures

## Why

[OpenAPI](../contracts/openapi.yaml) defines the thin HTTP boundary for the lifecycle commands in [sad.md §5–§6](../sad.md).

## What

Add strict request/response schemas and thin current-Warehouse controllers for Role create/update/delete, member Role assignment, and manager transfer. Wire the access module and stable error mappings, and declare the exact required Permission on every handler.

## Definition of Done

- [ ] Contract tests cover every mutation request/response and reject additional or invalid fields.
- [ ] REST tests cover specified success statuses and safe validation, authorization, protected-role, unavailable, concurrency, and atomic-operation failures.
- [ ] Controllers delegate only to commands, accept no Warehouse ID, and carry explicit Permission metadata.
- [ ] Access module wiring compiles without bypassing session plus Warehouse access guards.
- [ ] Contract/shared/server tests, lint, and static checks pass.

## Notes

This follows T9 because both tasks share the access-contract files and must remain one serialized, compile-safe lane.
