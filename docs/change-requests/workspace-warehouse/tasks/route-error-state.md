---
id: T5
title: 'Build the RouteErrorState component with a retry that re-runs the failed load'
layer: 'ui'
deps: ['T1']
acs: ['CR-AC-08']
source_refs: []
files_hint:
  [
    'apps/web/src/shared/components/RouteErrorState.tsx',
    'apps/web/src/shared/components/RouteErrorState.spec.tsx',
  ]
owner: 'Frontend Lead'
estimate: 'S'
status: 'todo'
---

# T5 — Build the RouteErrorState component with a retry that re-runs the failed load

## Why

[spec §CR-AC-08](../spec.md#5-acceptance-criteria) requires that a failed Workspace-context read at
the root renders "the application's standard error state with a way to retry and **not** the
no-context state" — a failed read means the actor's access is unknown, not that they have none. No
such component exists today; the router falls through to TanStack's built-in default
([sad §5 Added](../sad.md#added), [sad §11](../sad.md#11-risks-and-open-questions) row 1).

## What

Create `shared/components/RouteErrorState.tsx`: `TriangleAlertIcon` in `$danger`, heading, body, and
a primary **Try again** control that re-runs the failed load. Two consumers — `homeRoute` (T7) and
`warehouseRoute` — so it starts in `shared/` per
[placing web components](../../../system/guides/placing-web-components.md). Drawn as the `Error`
tile in frame `PV3g8` ([design-handoff § Component mapping](../design-handoff.md#component-mapping)).

## Definition of Done

- [ ] Unit test: the retry control invokes the router's reset/invalidate path so the failed load runs
      again
- [ ] Unit test: the rendered output is distinguishable from the no-context state (different heading
      and body, and it offers a retry the no-context state does not)
- [ ] Renders as page-level content with a heading, inside the existing shell landmarks
- [ ] Uses only T1's keys — no inline copy
- [ ] lint + vet clean

## Notes

The pending state that precedes it is TanStack Router's own pending component (`HeroUI/Spinner` plus
a label, frame `PV3g8`) — not part of this component and not a skeleton of the destination, because
no rule has been evaluated yet (CR-AC-08, design-handoff § Landing and refusals).
