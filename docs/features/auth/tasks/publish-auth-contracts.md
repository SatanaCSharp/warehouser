---
id: T2
title: 'Publish shared auth boundary schemas'
layer: 'ports'
deps: []
acs: ['AC-01', 'AC-02', 'AC-03', 'AC-04', 'AC-05', 'AC-07', 'AC-08', 'AC-09']
dod: 'Contract tests prove every OpenAPI auth request, response, and safe error shape, including Unicode code-point password length and password preservation.'
files_hint:
  [
    'packages/contracts/src/auth',
    'packages/contracts/src/index.ts',
    'packages/contracts/package.json',
  ]
owner: 'Tech Lead'
estimate: 'S'
status: 'todo'
---

# T2 — Publish shared auth boundary schemas

## Why

The web and server share the boundary described by [openapi.yaml](../contracts/openapi.yaml), while validation ownership follows [sad.md §2 and §7](../sad.md).

## What

Add the auth package subpath and Zod schemas/types for credentials, safe User projection, public errors, and the four operation outcomes. Preserve password input exactly and measure its limit in Unicode code points.

## Definition of Done

- [ ] Contract tests cover valid and invalid email grammar, trimming before email validation, Unicode code-point password length, and no password transformation.
- [ ] Schema tests cover all documented success, anonymous, and error payloads while rejecting secrets and unknown fields.
- [ ] Both web and server can import the auth subpath without internal package paths.
- [ ] Contract build and lint pass.

## Notes

This is additive and does not change an interface already implemented by production code, so it can remain an independent green task.
