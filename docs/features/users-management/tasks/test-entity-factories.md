---
id: T6
title: 'Add persistence-entity test factories'
layer: 'infra'
deps: []
acs: []
files_hint: ['apps/server/src/test/factories/']
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T6 — Add persistence-entity test factories

## Why

[data-model.md §Test fixtures](../data-model.md#test-fixtures) notes `apps/server/src/test/factories/`
currently has no persistence-entity factories — this feature is the first consumer needing them, and
every repository/command integration test in this epic depends on them.

## What

Add `accountEntityFactory(overrides?)`, `userEntityFactory(overrides?)`,
`warehouseMembershipEntityFactory(overrides?)`, and `sessionEntityFactory(overrides?)` under
`apps/server/src/test/factories/`, each building a valid `DeepPartial<...Entity>` respecting existing
invariants (the `AccountEntity.id === UserEntity.accountId` identity-pairing check, a `'custom'`-kind
membership row, a non-revoked Session).

## Definition of Done

- [ ] Each factory produces an entity that passes the schema's existing check constraints when
      persisted.
- [ ] No real-looking email or password — only `example.test` domains and clearly synthetic values,
      per the repository's PII guard.
- [ ] lint + vet clean.

## Notes

This task has no `deps` in `tasks.json`, but in practice unblocks the test-writing half of
[T4](./member-lifecycle-repository.md), [T5](./extend-authentication-repository.md), and
[T9](./create-member-command.md)–[T12](./delete-member-command.md) — sequence it early.
