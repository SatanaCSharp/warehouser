---
id: T3
title: 'Model auth domain invariants and repository ports'
layer: 'domain'
deps: []
acs:
  [
    'AC-01',
    'AC-01b',
    'AC-02',
    'AC-03',
    'AC-04',
    'AC-05',
    'AC-07',
    'AC-08',
    'AC-09',
    'AC-10',
    'AC-11',
  ]
dod: 'Domain unit tests prove email normalization, exact password handling, Account/User pairing, fixed Session expiry and revocation, and that the authenticated principal contains no authorization grants or secrets.'
files_hint: ['apps/server/src/auth/domain']
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T3 — Model auth domain invariants and repository ports

## Why

The feature owns Account, User, and Session invariants in [sad.md §5](../sad.md) and the framework-free persistence boundaries in [data-model.md](../data-model.md).

## What

Create domain values/entities, safe principal projection, application-facing repository ports, domain failures, and clock-facing expiry rules. Keep NestJS, TypeORM, HTTP, cookie, and password-library types outside this layer.

## Definition of Done

- [ ] Domain unit tests prove normalized email rules, exact password preservation, shared Account/User identity, 30-day non-sliding expiry, and one-way revocation.
- [ ] Port contract tests or compile assertions prove atomic registration is one operation and Session access is digest-based.
- [ ] Principal tests prove no credential, Session secret, Account internals, or authorization grant is exposed.
- [ ] Server lint and static analysis pass.

## Notes

Authentication identifies a User only; [spec AC-10 and AC-11](../spec.md) prohibit moving capability authorization or cross-Account management into this domain.
