---
id: T6
title: 'Implement atomic registration use case'
layer: 'app'
deps: ['T3', 'T4', 'T5']
acs: ['AC-01', 'AC-01b', 'AC-02', 'AC-03']
dod: 'Registration use-case tests prove successful linked identity creation, invalid-input rejection, duplicate-email mapping including the concurrency loser, and complete rollback when initial Session persistence fails.'
files_hint: ['apps/server/src/auth/usecases/commands/register']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T6 — Implement atomic registration use case

## Why

Registration follows the all-or-nothing runtime in [sad.md §6.1](../sad.md) and [spec AC-01–AC-03](../spec.md).

## What

Implement the register command orchestration: normalize and validate input, detect duplicates, hash the exact password, create the linked graph and initial Session, call the single atomic repository operation, and map expected failures.

## Definition of Done

- [ ] Use-case tests prove the successful safe User and transport-only Session-secret result.
- [ ] Tests prove invalid input performs no persistence and duplicate email uses the approved disclosure.
- [ ] Tests prove repository/session failure produces the unavailable outcome and no partial identity.
- [ ] A concurrency-loser test proves unique-constraint failure maps to the same duplicate result.
- [ ] Server test, lint, and static analysis pass.

## Notes

Do not auto-replay registration after an indeterminate network response; [sad.md §6.1](../sad.md) documents the HTTP transaction boundary.
