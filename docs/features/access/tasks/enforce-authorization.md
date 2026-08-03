---
id: T5
title: 'Enforce fresh Warehouse-scoped authorization'
layer: 'wiring'
deps: ['T3']
acs: ['AC-15', 'AC-16', 'AC-17', 'AC-19', 'AC-22']
files_hint:
  [
    'apps/server/src/shared/guards/warehouse-access.guard.ts',
    'apps/server/src/shared/decorators/required-permission.decorator.ts',
    'apps/server/src/shared/access',
    'packages/shared-types/src/enums',
    'apps/server/src/shared/errors/global-http-exception.filter.ts',
    'tests/access/authorization-coverage.spec.mjs',
  ]
owner: 'Security Lead'
estimate: 'L'
status: 'todo'
---

# T5 — Enforce fresh Warehouse-scoped authorization

## Why

The shared boundary in [sad.md §6.2 and §8](../sad.md) must make the security rules in [spec.md §6.1](../spec.md) the default for every authenticated business handler.

## What

Add stable Permission/error identifiers with their first implementations, required-Permission metadata, immutable request principal attachment, `WarehouseAccessGuard`, safe global error mapping, and an architecture test that classifies authenticated handlers as protected or infrastructure-exempt.

## Definition of Done

- [ ] Guard tests prove fresh persistence reads, composition after session auth, immutable principal attachment, and denial for missing membership or Permission.
- [ ] Integration test proves removed Permission or reassigned Role affects the next request without session renewal.
- [ ] Safe failure tests do not disclose cross-Warehouse existence or log sensitive values.
- [ ] Architecture test fails for a new unclassified authenticated business handler.
- [ ] Shared/server tests, lint, and static checks pass.

## Notes

The guard proves actor authority only; each owning use case still proves target ownership. Do not cache Permission sets or add telemetry.
