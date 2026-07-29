---
id: T14
title: 'Verify auth journeys and release quality gates'
layer: 'tests'
deps: ['T9', 'T11', 'T12', 'T13']
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
dod: 'Automated end-to-end, load-smoke, reconciliation, secret-leak, dependency, accessibility, keyboard, and approved-frame visual checks pass, with Product and Security approval recorded before implementation is declared shippable.'
files_hint:
  [
    'apps/server/test/auth',
    'apps/web/src/modules/auth/auth.e2e.spec.tsx',
    'tests/auth',
    'docs/features/auth/previews',
    'docs/features/auth/tasks/tracker.md',
  ]
owner: 'Tech Lead + Security Lead'
estimate: '1d'
status: 'todo'
---

# T14 — Verify auth journeys and release quality gates

## Why

Cross-surface verification is required by [sad.md §10](../sad.md), the measurable targets in [spec §6](../spec.md), and the approved visual/accessibility handoff.

## What

Add focused end-to-end journeys and release-gate scripts/reports that exercise the integrated feature without duplicating lower-layer tests. Record required human approvals and visible design deviations in the tracker/review evidence.

## Definition of Done

- [ ] End-to-end tests pass for sign-up, restart restoration, sign-in failure equivalence, sign-out revocation, expired/revoked Session handling, and authenticated-but-unauthorized denial.
- [ ] The even-mix load smoke meets the documented latency, throughput, and terminal-outcome availability targets.
- [ ] Reconciliation and secret-leak checks report zero orphans and zero plaintext/reusable secrets; dependency vulnerability checks pass or have approved disposition.
- [ ] Keyboard, focus, accessibility, and desktop/mobile approved-frame comparisons pass with every visible deviation recorded.
- [ ] Product and Security Lead approval of the feature specification/security boundary is recorded before the tracker can mark the release shippable.

## Notes

This task is a focused release-verification session, not a substitute for the per-task tests named throughout the DAG.
