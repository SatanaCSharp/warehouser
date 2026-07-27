---
id: T8
title: 'Harden credentialed HTTP platform boundaries'
layer: 'wiring'
deps: ['T2']
acs: ['AC-01b', 'AC-02', 'AC-05', 'AC-08', 'AC-10', 'AC-11']
dod: 'Server bootstrap integration tests prove explicit credentialed-origin handling, safe global error envelopes, credential redaction, and privacy-safe auth outcome telemetry using documented configuration placeholders.'
files_hint:
  [
    'apps/server/src/main.ts',
    'apps/server/src/shared/config',
    'apps/server/src/shared/errors',
    'apps/server/src/shared/observability',
    'apps/server/.env.example',
  ]
owner: 'Backend Lead + Platform Owner'
estimate: 'M'
status: 'todo'
---

# T8 — Harden credentialed HTTP platform boundaries

## Why

Cookie authentication cannot ship with unrestricted CORS or unsafe exception logging; the required boundaries are identified in [sad.md §2, §8, and §11](../sad.md).

## What

Add validated placeholder-driven origin/cookie configuration, explicit credentialed CORS/origin enforcement support, the shared safe exception envelope, redaction, and privacy-safe outcome metrics needed by auth.

## Definition of Done

- [ ] Bootstrap integration tests allow configured application origins with credentials and reject unconfigured state-changing origins.
- [ ] Exception-filter tests map validation, application, and unexpected failures without logging request bodies, passwords, cookies, raw emails, hashes, or digests.
- [ ] Telemetry tests record stable terminal outcomes and latency without personal or secret labels.
- [ ] `.env.example` documents placeholders only; server test, lint, and static analysis pass.

## Notes

Do not inspect any local `.env` file. Automated attempt limiting remains explicitly out of scope.
