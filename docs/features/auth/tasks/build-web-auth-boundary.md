---
id: T10
title: 'Build the credentialed web API and feedback boundary'
layer: 'infra'
deps: ['T2']
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
  ]
dod: 'Web adapter tests prove credentialed auth calls, contract parsing, normalized and deduplicated translated failures, field-error mapping, and the approved action-specific notification exceptions.'
files_hint:
  [
    'apps/web/src/modules/auth/api',
    'apps/web/src/shared/api',
    'apps/web/src/shared/errors',
    'apps/web/src/shared/i18n',
    'apps/web/src/shared/notifications',
    'apps/web/src/main.tsx',
    'apps/web/package.json',
    'pnpm-lock.yaml',
  ]
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T10 — Build the credentialed web API and feedback boundary

## Why

The browser must use one contract-parsed, credentialed boundary and shared feedback policy under [sad.md §5](../sad.md) and the approved [design handoff](../design-handoff.md).

## What

Add the minimum shared API client, normalized failure mapping, i18n, toast container/deduplication, and module-owned auth calls for all four operations. Add only the repository-documented dependencies required for this platform boundary.

## Definition of Done

- [ ] Adapter tests prove `credentials` are enabled and every response is parsed through the shared auth contracts.
- [ ] Error tests prove translated field mapping and exactly one deduplicated toast per API failure.
- [ ] Feedback tests prove sign-up/sign-out success notifications and no sign-in/restoration success notification.
- [ ] No cookie or Session secret is exposed to application code; web test, lint, and build pass.

## Notes

This task owns shared platform setup; T12/T13 consume it rather than introducing feature-local alternatives.
