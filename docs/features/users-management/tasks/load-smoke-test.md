---
id: T15
title: 'Add a load smoke test for the four lifecycle endpoints'
layer: 'tests'
deps: ['T13']
acs: []
files_hint: ['apps/server/src/users/']
owner: 'Backend Lead'
estimate: 'S'
status: 'todo'
---

# T15 — Add a load smoke test for the four lifecycle endpoints

## Why

[spec §6](../spec.md) sets explicit p95 latency targets (create ≤400ms, email/password-change
≤300ms, delete ≤500ms, excluding client network time) and a throughput target (≥30 ops/s per
instance for 10 minutes), each requiring "Automated load smoke test"/"Structured server timing
logs" as measurement.

## What

Add an automated load smoke test exercising all four endpoints against a running server instance,
sustaining ≥30 operations/second for 10 minutes, and asserting p95 latency against each endpoint's
target using the structured Pino timing logs `sad §8` requires (duration, outcome code, operation,
non-sensitive identifiers — no email, password, or password hash logged).

## Definition of Done

- [ ] The smoke test sustains the throughput target for the full 10-minute window without error-rate
      regression.
- [ ] Reported p95 latency for each of the four operations is within its `spec.md` §6 target.
- [ ] Timing logs contain no credential material.
- [ ] The test is runnable on demand (not gated into every CI run given its 10-minute duration) —
      document the invocation in the test file itself.

## Notes

This task depends on [T13](./users-controller-and-module-wiring.md) because it exercises the wired
HTTP endpoints, not the commands directly.
