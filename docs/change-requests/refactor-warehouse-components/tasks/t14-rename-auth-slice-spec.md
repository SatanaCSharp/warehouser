---
id: T14
title: 'Rename `authSlice.spec.ts` and guard the absence of `store/` scaffolding'
layer: 'tests'
deps: ['T7']
acs: ['CR-AC-06']
files_hint: ['apps/web/src/modules/auth/store']
source_refs: ['apps/web/src/modules/auth/store/authSlice.spec.ts']
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T14 — Rename `authSlice.spec.ts` and guard the absence of `store/` scaffolding

## Why

CH-W7's rename half, and the mechanical part of [`spec.md` CR-AC-06](../spec.md#cr-ac-06-cr-us-02-ch-w7--the-state-audit). The spec name should follow the module it tests (`auth.slice.ts`), and the criterion pins that no Redux slice was added under cover of the refactor.

## What

Rename `apps/web/src/modules/auth/store/authSlice.spec.ts` → `auth.slice.spec.ts`, changing **nothing** inside it, and update any reference to the old filename.

Add the CR-AC-06 structural guard: enumerate `apps/web/src/modules/*/store` and assert the result is exactly `modules/auth/store` — no `store/` directory exists in `warehouse` or `workspace`, empty or otherwise.

## Definition of Done

- [ ] `git diff -M 42f1205 -- <old> <new>` shows a pure rename — zero assertion hunks
- [ ] `auth.slice.spec.ts` is present and `authSlice.spec.ts` is absent
- [ ] the guard passes and fails when an empty `modules/workspace/store/` is created
- [ ] `modules/auth`'s total diff against `42f1205` is this rename plus the 2 `shared/api` import specifiers from T6 — nothing else (CR-RG-07)
- [ ] `pnpm --filter @warehouser/web lint && test` clean

## Notes

**`spec.md` §3 non-goal:** no new Redux slice, and no empty `store/` scaffolding. The `change.md` §4.2 audit found nothing qualifying; T15 re-runs it at `HEAD`.

Runs parallel to T9 and T10 — it touches only `modules/auth`.
