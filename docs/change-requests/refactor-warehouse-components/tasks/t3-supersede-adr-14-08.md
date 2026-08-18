---
id: T3
title: 'Supersede ADR 14-08-2026 and re-list both ADRs in `web-index.md`'
layer: 'docs'
deps: ['T2']
acs: ['CR-AC-03']
files_hint:
  [
    'docs/system/adr/14-08-2026-domain-owned-flat-modules.md',
    'docs/system/web-index.md',
  ]
source_refs:
  [
    'docs/system/adr/14-08-2026-domain-owned-flat-modules.md',
    'docs/system/web-index.md',
  ]
owner: 'YuriiH'
estimate: 'S'
status: 'todo'
---

# T3 — Supersede ADR 14-08-2026 and re-list both ADRs in `web-index.md`

## Why

CH-D1 and CH-D6 of [`change.md` §3](../change.md). [`sad.md` §4.2](../sad.md#42-the-flatness-test-becomes-is-it-a-home-not-does-its-name-mention-another-entity) is explicit that the superseded body is a historical record and stays **verbatim**, including the sentence naming this request's target directory as a flatness violation.

## What

Edit only the status block of `docs/system/adr/14-08-2026-domain-owned-flat-modules.md`: `Accepted` → `Superseded by <CH-D2 ADR>`, with a relative forward link. Leave every other line untouched — including §Decision's `modules/workspace/components/workspace-administration/warehouses/` example.

Then update `docs/system/web-index.md` §Decisions so both ADRs appear with their current status and one-line descriptions that tell a contributor which one governs.

## Definition of Done

- [ ] `git diff` on the ADR shows hunks in the status block only — the body is byte-identical
- [ ] the forward link resolves to the file T2 created
- [ ] `web-index.md` lists ADR 14-08 as Superseded and CH-D2 as Accepted, and a contributor following the index reaches CH-D2 for placement
- [ ] no other `docs/system` document is edited by this task

## Notes

`docs/system/server-index.md` and `docs/system/guides/adding-a-server-module.md` also cite ADR 14-08 and are **out of scope** (`spec.md` §3). They will advertise a Superseded ADR until a later request reconciles them — an accepted consequence, not a defect to fix here.
