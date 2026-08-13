---
id: T15
title: 'Verify the 390px switcher fit and the entry-latency ceiling manually'
layer: 'tests'
deps: ['T11', 'T12']
acs: ['CR-AC-01', 'CR-AC-02', 'CR-AC-14', 'CR-RG-06']
source_refs: []
files_hint:
  [
    'docs/change-requests/workspace-warehouse/tasks/responsive-and-entry-latency-verification.md',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T15 — Verify the 390px switcher fit and the entry-latency ceiling manually

## Why

Two [spec §6](../spec.md#6-non-functional-requirements) rows are measured by manual verification
rather than by a test, because the repository adds no telemetry and no percentile can be drawn from a
manual run: "Switcher fit at 390px" and "Warehouse entry latency", the latter deliberately restated
as a ceiling over five consecutive runs. [sad §10](../sad.md#10-verification-strategy)'s
Manual/responsive row is this task.

## What

Run the app (`run` / the repository's UI-verification practice) and record the results **in this
file**:

- **390px viewport** — the grouped switcher, its Workspace row and its nested group fit the existing
  context bar without horizontal overflow, and its popover does not overflow the viewport
  (350px at a 390px viewport, per design-handoff § Responsive behavior).
- **390px viewport** — the restructured warehouses-tab row renders correctly with its Enter action,
  and the no-context shell renders with no drawer toggle in the header (frame `MOuOz`).
- **Entry latency** — five consecutive runs from _activating a switcher row_ to the Warehouse view
  being rendered with its own access projection resolved, and five from _activating an Enter action_
  to the same event, each measured by client-side navigation timing. Every run must be ≤ 250 ms.

## Definition of Done

- [ ] No horizontal overflow of the context bar at 390px, and no popover overflow — recorded with the
      observation
- [ ] The warehouses-tab row and the no-context shell verified at 390px
- [ ] Ten timing figures (five switcher, five Enter) written into this file, each ≤ 250 ms
- [ ] Any figure above the ceiling is raised rather than rounded down, with the run that produced it
      named

## Results

<!-- Fill in during the run. Do not mark this task done with the table empty. -->

| Check                             | Result |
| --------------------------------- | ------ |
| 390px switcher fit                | —      |
| 390px popover containment         | —      |
| 390px warehouses-tab row          | —      |
| 390px no-context shell, no toggle | —      |
| Switcher entry runs 1–5 (ms)      | —      |
| Enter-action runs 1–5 (ms)        | —      |

## Notes

The archived-row dimming question in [design-handoff § Open questions](../design-handoff.md#open-questions)
is due at implementation: the default is to keep the 50% opacity, and the WCAG disabled-control
exemption applies because the rows are non-actionable and carry the literal text "Archived". Confirm
during this run rather than changing it silently.
