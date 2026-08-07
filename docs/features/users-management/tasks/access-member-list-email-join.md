---
id: T14
title: 'Extend the access member-list read path with email'
layer: 'infra'
deps: []
acs: []
files_hint:
  [
    'apps/server/src/access/usecases/queries/list-access-members.query.ts',
    'apps/server/src/shared/domain/repositories/access-read.repository.ts',
    'packages/contracts/src/access/',
  ]
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T14 — Extend the access member-list read path with email

## Why

[data-model.md §Non-schema follow-ups](../data-model.md#non-schema-follow-ups-not-this-stages-deliverable-flagged-for-tasks)
and [sad §11](../sad.md#11-risks-and-open-questions) flag that the Members tab's current read path
(`GET /api/v1/access/members`) does not return email — needed to render/identify rows and to label
icon-only actions accessibly (approved design handoff). This is an `access`-owned read-path change,
not new `users` persistence.

## What

Add an `INNER JOIN accounts ON accounts.user_id = membership.user_id` to
`AccessReadRepository.listMembersAndAssignments` (already indexed via `uq_accounts_user_id`), and
project `accounts.normalized_email` as `email` on the `AccessMemberRead` shape. Add `email` to
`packages/contracts/access`'s corresponding response schema.

## Definition of Done

- [ ] Repository integration test: `listMembersAndAssignments` returns the correct `email` for each
      member row, sourced from `accounts.normalized_email`.
- [ ] `access`'s existing member-list tests (and any consumer of `AccessMemberRead`) stay green with
      the new field present.
- [ ] No schema migration — confirmed no new column, index, or table is added.
- [ ] lint + vet + typecheck clean.

## Notes

This resolves the tension `sad §7`/`§11` names between "this feature does not change that read
path" and "confirm... this is a read-path change owned by `access`" in favor of `§11`: the read
needs the join, but `users` does not own or modify it — this task lives entirely in `access`.
