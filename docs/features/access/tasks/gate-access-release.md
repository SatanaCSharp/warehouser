---
id: T14
title: 'Gate access security, atomicity, and performance'
layer: 'tests'
deps: ['T4', 'T5', 'T9', 'T10', 'T11', 'T13']
acs:
  [
    'AC-01',
    'AC-02',
    'AC-11',
    'AC-12',
    'AC-13',
    'AC-15',
    'AC-16',
    'AC-17',
    'AC-18',
    'AC-19',
    'AC-20',
    'AC-21',
    'AC-22',
  ]
files_hint:
  ['tests/access', 'apps/server/src/access/reconciliation', 'package.json']
owner: 'Security Lead'
estimate: 'L'
status: 'done'
---

# T14 — Gate access security, atomicity, and performance

## Why

The measurable targets in [spec.md §6](../spec.md) and verification strategy in [sad.md §10](../sad.md) require feature-wide evidence beyond slice-level tests.

## What

Add release tests and reconciliation checks for authorization coverage, catalogue/manager completeness, atomic workflows, immediate revocation, safe cross-Warehouse handling, latency, and throughput. Use test-side measurement and existing structured logging only.

## Definition of Done

- [x] Integration gates prove 100% atomic outcomes for registration, assigned-Role deletion, and manager transfer under injected failures.
- [x] Security gates prove next-decision revocation, non-enumerating cross-Warehouse denial, and explicit Permission/ownership coverage for every authenticated business capability.
- [x] Catalogue reconciliation proves assignable/reserved classification, every manager Role receives the release-defined set, and custom Roles remain unchanged unless explicit.
- [x] Automated smoke test sustains at least 50 protected operations/second per service instance for 10 minutes.
- [x] Measured p95 added authorization is at most 50 ms, Role reads at most 250 ms, and Role mutations at most 500 ms, excluding client network time.
- [x] Repository tests, build, lint, and static checks pass without adding telemetry.

## Notes

Run database-backed gates only with placeholder/development values documented by `.env.example`; never inspect local credential files.
