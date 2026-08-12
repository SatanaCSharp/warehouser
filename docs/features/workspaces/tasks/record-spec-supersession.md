---
id: T29
title: 'Record the supersession of the approved access and users-management specs'
layer: 'docs'
deps: []
acs: []
files_hint:
  [
    'docs/features/access/spec.md',
    'docs/features/users-management/spec.md',
    'docs/features/workspaces/spec.md',
  ]
owner: 'Tech Lead'
estimate: 'S'
status: 'todo'
---

# T29 — Record the supersession of the approved access and users-management specs

## Why

[spec §8](../spec.md#8-open-questions) and the first row of
[sad §11](../sad.md#11-risks-and-open-questions): the approved Access spec excludes membership in
more than one Warehouse as a non-goal and states one Warehouse per member as an invariant, and the
approved Users-management spec creates a User inside a Warehouse without establishing the Workspace
relation. This feature reverses both. Leaving two approved specs asserting invariants the code
violates is the actual risk.

## What

Amend both approved specs in place with an explicit supersession note rather than opening two
separate change-request pipelines — neither approved feature is being re-implemented, and
`workspaces` **is** the change:

- `docs/features/access/spec.md` — mark the multi-Warehouse-membership non-goal and the
  one-Warehouse-per-member invariant superseded by `workspaces`, with a back-link to
  [spec §1](../spec.md#1-context) and to [ADR 0002](../adr/0002-parallel-workspace-authority-tables.md)
  for how the approved Warehouse relations were preserved rather than weakened.
- `docs/features/users-management/spec.md` — record that member creation now establishes the new
  User's Workspace relation from the Warehouse they are created in, with a back-link to
  [T27](./reshape-users-rest.md)'s change and to `spec.md` §1's second boundary.
- `docs/features/workspaces/spec.md` §8 — close both open questions. The second is closed with the
  `design-handoff.md` resolution (the `SELECTION ENDED` state on `mXHZS`/`pUVt0`: no selection and an
  explanation), **not** the spec's looser "fall back to another membership" default — choosing one of
  several memberships on the member's behalf is exactly what AC-03b forbids.

## Definition of Done

- [ ] `docs/features/access/spec.md` carries the supersession note with a working back-link, and its
      original wording is struck through or annotated rather than deleted.
- [ ] `docs/features/users-management/spec.md` carries the Workspace-relation note with a working
      back-link.
- [ ] `docs/features/workspaces/spec.md` §8 has zero open checkboxes, and the second answer matches
      `design-handoff.md` §"Resolved here".
- [ ] `design-handoff.md` §Open questions records the icon decision (hand-rolled, see
      [T32](./shared-icon-components.md)) as resolved.
- [ ] Every relative link in the touched files resolves; markdown lint clean.

## Notes

This task writes no code and blocks nothing, but it should land early — it is the record that keeps
a reviewer from reading the approved Access spec and concluding this feature is out of bounds.
