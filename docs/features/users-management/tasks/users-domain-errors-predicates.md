---
id: T3
title: 'Add users domain errors and invariant predicates'
layer: 'domain'
deps: []
acs: ['AC-11', 'AC-13', 'AC-14', 'AC-16', 'AC-18', 'AC-19', 'AC-20']
files_hint: ['apps/server/src/users/domain/']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Add users domain errors and invariant predicates

## Why

[spec §5](../spec.md) defines the self-action (AC-11, AC-18), protected-Manager-target (AC-13,
AC-14), Permission-exceeded-target (AC-16, AC-19), and reserved-Role-selection (AC-20) invariants.
[sad §4](../sad.md) requires these as "named predicate-backed factories, no ad hoc `ApplicationError`
construction at the call site," following `access/domain/errors/access.errors.ts`'s pattern.

## What

Add `apps/server/src/users/domain/errors/` with typed error factories for: self-action (an actor
targeting their own record), protected-Manager-target (target holds the Warehouse Manager Role),
Permission-exceeded-target (target's or selected Role's Permission-ID set is not a subset of the
actor's own), and reserved-Role-selection (the selected Role is the reserved Warehouse Manager
Role). Add the corresponding pure predicate functions the commands will call — no NestJS, HTTP, or
TypeORM imports anywhere in this directory.

## Definition of Done

- [ ] Unit tests cover each predicate in isolation: self-action true/false, protected-Manager true/
      false, Permission-exceeded-target true/false (both the create-time creator-vs-Role direction
      and the credential-change actor-vs-target direction), and reserved-Role-selection true/false.
- [ ] Each error factory produces the stable error shape `docs/system`'s error-handling ADR
      requires, matching `access.errors.ts`'s pattern.
- [ ] `apps/server/src/users/domain/` has zero framework imports (verified by the architecture test
      added in [T13](./users-controller-and-module-wiring.md)).
- [ ] lint + vet clean.

## Notes

The cross-Warehouse-hiding and missing-Permission denials (AC-03, AC-09, AC-10) are **not** built
here — they reuse the existing guard/`access` denial shape (`sad §4`), owned by
[T13](./users-controller-and-module-wiring.md).
