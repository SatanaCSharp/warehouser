---
id: T4
title: 'Implement credential and opaque-session security adapters'
layer: 'infra'
deps: ['T3']
acs: ['AC-01', 'AC-04', 'AC-05', 'AC-07', 'AC-08', 'AC-09']
dod: 'Security adapter tests prove reviewed memory-hard hashing and upgrade detection, bounded dummy verification, cryptographically random secrets, digest-only persistence values, and fixed expiry calculation.'
files_hint:
  [
    'apps/server/src/auth/services',
    'apps/server/src/auth/infrastructure/security',
    'apps/server/package.json',
    'pnpm-lock.yaml',
  ]
owner: 'Backend Lead + Security Lead'
estimate: 'M'
status: 'todo'
---

# T4 — Implement credential and opaque-session security adapters

## Why

Credential and Session handling follows [ADR 0001](../adr/0001-server-managed-opaque-cookie-sessions.md) and the security strategy in [sad.md §4 and §8](../sad.md).

## What

Select the deployment-compatible memory-hard password library and reviewed parameters, implement hash/verify/upgrade and bounded dummy verification, and implement opaque secret generation plus SHA-256 digesting behind the domain ports.

## Definition of Done

- [ ] Security Lead records approval of the selected algorithm and development-safe parameter placeholders.
- [ ] Unit tests prove hash verification, upgrade detection, identical public failure inputs, and bounded dummy verification for unknown accounts.
- [ ] Unit tests prove fresh high-entropy Session secrets, 32-byte digests, and no raw secret in adapter return values sent to persistence.
- [ ] Dependency audit, server test, lint, and static analysis pass.

## Notes

Never display environment values. Read only `.env.example` when configuration guidance is needed.
