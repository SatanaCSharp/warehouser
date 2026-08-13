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

Run on 2026-08-13 against a **production build** (`vite build` + `vite preview`, port 3300) with the
NestJS API on port 3100 and the live PostgreSQL/Redis containers. Actor: Workspace Owner of
`Workspace1`, holding memberships in two non-archived Warehouses (`WH12`, `wh2`).

| Check                             | Result                                                        |
| --------------------------------- | ------------------------------------------------------------- |
| 390px switcher fit                | **NOT VERIFIED** — see «390px checks outstanding» below       |
| 390px popover containment         | **NOT VERIFIED** — see «390px checks outstanding» below       |
| 390px warehouses-tab row          | **NOT VERIFIED** — see «390px checks outstanding» below       |
| 390px no-context shell, no toggle | **NOT VERIFIED** — see «390px checks outstanding» below       |
| Switcher entry runs 1–5 (ms)      | 80.3 · 58.4 · 73.9 · 69.0 · 55.6 — max **80.3**, all ≤ 250 ms |
| Enter-action runs 1–5 (ms)        | 73.3 · 65.5 · 68.6 · 76.8 · 77.6 — max **77.6**, all ≤ 250 ms |

### How the ten figures were measured

Each run is one **cold** entry: the page was reloaded before every run, so the entered Warehouse's
access projection was fetched over the network rather than served from the RTK Query cache. The
clock starts on activation (`t0`, immediately before the row/link is activated) and stops when
**both** conditions hold — the definition CR-AC-02/CR-AC-14 ask for, "the Warehouse view being
rendered with its own access projection resolved":

- a `MutationObserver` sees the address at `/warehouses/:id` **and** that Warehouse's own navigation
  list rendered; and
- a `PerformanceObserver` sees the `resource` entry for
  `/api/v1/warehouses/:id/access/current` reach `responseEnd` at or after `t0`.

The reported figure is the later of the two. Render alone landed at 43.6–71.1 ms across the ten
runs; the projection read was the tail in every case.

**Measurement pitfall worth recording.** A first attempt polled with `setTimeout`/
`requestAnimationFrame` and produced a flat ~1000 ms on every run, in both dev and production
builds, and on navigations that run no entry guard at all. That figure was an artefact: Chrome
clamps timers to ~1 s in a background tab and pauses `requestAnimationFrame` entirely, so the poll
could only observe at 1 s granularity. The observer-based measurement above is not subject to that
clamp. Anyone re-running this must not use timer polling from an unfocused tab.

### 390px checks outstanding

The four responsive rows could not be verified in this run: the browser-automation window would not
hold a 390 px viewport — `resize_window` reported success but `window.innerWidth` stayed at 1338,
briefly reached 1079, then snapped back, and `matchMedia('(min-width: 640px)')` never went false, so
the below-`sm` branches (the context-bar switcher placement and the drawer toggle) never rendered.
Verifying against a viewport that never dropped below `sm` would have proved nothing.

These four rows need a person at a real 390 px viewport (device toolbar or a genuinely narrow
window). What to check, and the state to reach it from:

1. **Switcher fit + popover containment** — any authenticated page; the switcher sits in the
   full-width context bar below `sm`. Confirm the Workspace row and the nested Warehouse group cause
   no horizontal overflow of that bar, and that the popover (350 px per design-handoff § Responsive
   behavior) does not overflow the viewport.
2. **Warehouses-tab row** — `/workspace` → Warehouses tab. Confirm the restructured row (selection
   button + trailing Enter link, never nested) renders correctly and the Enter action is reachable.
3. **No-context shell, no drawer toggle** — needs an actor CR-AC-08 reaches rule (3) for: no
   Workspace administration authority and a null effective Warehouse. Confirm the header renders
   **no** drawer toggle (frame `MOuOz`).
4. **Archived-row dimming** ([design-handoff § Open questions](../design-handoff.md#open-questions))
   — confirm the 50% opacity is kept, per the note below.

### Verified incidentally during this run

Not part of the DoD, but observed live against the real stack and worth recording:

- Landing resolved a Workspace Owner to `/workspace` by CR-AC-08 rule (1).
- The grouped switcher rendered one Workspace row above a labelled, nested Warehouse group, with the
  trigger naming the entered context (CR-AC-01).
- The warehouses tab rendered a trailing Enter action on both non-archived membership rows, as a
  sibling of the selection button rather than nested inside it (CR-AC-13).

## Notes

The archived-row dimming question in [design-handoff § Open questions](../design-handoff.md#open-questions)
is due at implementation: the default is to keep the 50% opacity, and the WCAG disabled-control
exemption applies because the rows are non-actionable and carry the literal text "Archived". Confirm
during this run rather than changing it silently.
