---
id: T8
title: 'Implement atomic Warehouse Manager transfer'
layer: 'app'
deps: ['T3', 'T5']
acs: ['AC-13', 'AC-14', 'AC-14a']
files_hint:
  [
    'apps/server/src/access/usecases/commands/transfer-warehouse-manager.command.ts',
    'apps/server/src/access/usecases/manager-transfer.spec.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T8 — Implement atomic Warehouse Manager transfer

## Why

The protected flow in [spec AC-13–AC-14a](../spec.md) and [sad.md §6.4](../sad.md) is the only legal way to change the manager assignment.

## What

Implement transfer with current-manager and reserved-Permission checks, a different same-Warehouse recipient, a custom replacement Role for the former manager, locked precondition rechecks, and one atomic persistence operation.

## Definition of Done

- [ ] Success test proves recipient promotion and former-manager reassignment commit together.
- [ ] Tests reject non-manager, missing Permission, self-recipient, cross-Warehouse recipient, and invalid replacement.
- [ ] Concurrent attempts and injected write failures preserve exactly one manager and a Role for both members.
- [ ] Both users' next principal resolution observes the committed authority.
- [ ] Server tests, lint, and static checks pass.

## Notes

Use the lock order fixed in [data-model.md](../data-model.md); map expected conflicts to stable access errors.
