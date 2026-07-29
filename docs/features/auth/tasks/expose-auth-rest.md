---
id: T9
title: 'Expose and wire the auth REST boundary'
layer: 'ports'
deps: ['T2', 'T6', 'T7', 'T8']
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
dod: 'REST integration tests prove all four OpenAPI operations, cookie issue/expiry attributes, origin enforcement, generic sign-in failure, safe projections, AuthModule composition, and an authentication guard that attaches only userId.'
files_hint:
  [
    'apps/server/src/auth/rest',
    'apps/server/src/auth/auth.module.ts',
    'apps/server/src/auth/authentication',
    'apps/server/src/app.module.ts',
  ]
owner: 'Backend Lead'
estimate: 'M'
status: 'todo'
---

# T9 — Expose and wire the auth REST boundary

## Why

The four HTTP operations and safe payloads are fixed by [openapi.yaml](../contracts/openapi.yaml); transport ownership and composition are defined in [sad.md §5 and §7](../sad.md).

## What

Add thin Zod-backed controllers/DTO adapters, cookie issue/expiry helpers, AuthModule composition, and the reusable authentication guard/strategy that resolves the opaque cookie into a safe principal.

## Definition of Done

- [ ] REST integration tests cover every documented status and error code for sign-up, sign-in, current Session, and sign-out.
- [ ] Cookie tests prove host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, fixed lifetime, production `Secure`, and expiry on anonymous restoration/sign-out.
- [ ] Tests prove both invalid-credential cases are identical and response/log bodies contain no auth secret.
- [ ] Guard tests attach only `userId`; AuthModule boots from AppModule; server test, lint, and build pass.

## Notes

Cookie construction is transport-only and occurs after durable use-case success.
