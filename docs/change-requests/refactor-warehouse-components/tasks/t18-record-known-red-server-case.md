---
id: T18
title: "Record CR-RG-06's known-red server case as identically failing at `HEAD`"
layer: 'tests'
deps: ['T7']
acs: ['CR-RG-06']
files_hint:
  [
    'apps/server/src/access/rest/controllers/access-http-contract.integration.spec.ts',
  ]
source_refs: []
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T18 — Record CR-RG-06's known-red server case as identically failing at `HEAD`

## Why

[`spec.md` CR-RG-06](../spec.md#cr-rg-06--the-known-red-baseline-spec) carries a known-red baseline through from `modules-level-refactor`. Pinning it as _identically_ red is what stops the refactor from silently changing server behavior — and stops someone from "fixing" it inside a no-behavior-change request.

## What

Run the server integration suite at `HEAD` against an ephemeral real database (never a mocked store), and record for the manager-transfer concurrency case: the assertion text, the received status and the expected status — then compare each against the same case at `baseline_revision`.

Record the outcome in the review artifact. This task writes **no** production code.

## Definition of Done

- [ ] the case fails at `HEAD` with the same assertion and the same 403-where-409-expected as at `42f1205`
- [ ] no file under `apps/server/` is modified by this task
- [ ] if no container runtime is available, the criterion is recorded **blocked, not satisfied**, and CR-RG-07's byte-identical-server evidence is cited as bounding — not discharging — the risk

## Notes

**Do not make it pass.** `spec.md` §3 fences this explicitly: fixing it is a behavior change belonging to a separate `/fix`.

An unrunnable suite is not evidence of identical failure (`spec.md` §5.1, `sad.md` R5). `require_integration: auto` probes for a runtime; if there is none, say so plainly in the review rather than marking the row green.
