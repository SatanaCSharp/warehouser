---
id: T15
title: 'Build the always-present condition block: the refuse control, the refusal editor rows and the condition summary live region'
layer: 'ui'
deps: [T13]
acs: ['AC-01', 'AC-01a', 'AC-01b', 'AC-05', 'AC-08', 'AC-13', 'AC-24']
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/purchase-draft-transitions/components/line-ending-dialog/'
  - 'apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts'
  - 'apps/web/src/shared/icons/'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'L'
status: 'todo'
---

# T15 — Build the always-present condition block

## Why

The approved design's central decision is that the Arrival Inspection is **part of the line's ending,
not a step after it**: one condition block, always visible, between the presented quantity and the
assignments. Refusing costs one click and two fields, and the accepted figure is derived so a refusal
never makes a member retype anything. Derives from
[design-handoff.md § States and interactions](../design-handoff.md), approved frame
`Arrival Inspection / Ending Dialogs / Desktop / v1` (`W6TARi`), cell `H0jcSr`, and mobile frame
`kejd2`.

## What

Inside `LineEndingFieldset.tsx` and its own child components under `.../line-ending-dialog/components/`
per [placing web components](../../../system/guides/placing-web-components.md):

- the **condition block** head row — micro-label, the Source chip, and the `Refuse some of this`
  control (`HeroUI/Button`, neutral `--default`, 32px);
- the **refusal editor row** — quantity (`FormTextField`), Reason (`FormSelectField` fed by the
  catalogue read), description (`FormTextAreaField`), remove (icon button, 36×36). Desktop puts
  quantity + Reason on one row; mobile stacks them;
- the **condition summary** — four figures (ordered, presented, refused, accepted), one row of four on
  desktop and 2×2 on mobile, as a `role="status"` `aria-live="polite"` region **alongside** the
  assignment summary the shipped modal already announces, replacing nothing.

Inject the catalogue read into the shared API slice. Hand-roll `circle-x`, `package-x` and
`clipboard-check` into `shared/icons/` following the existing pattern and Lucide geometry.

## Definition of Done

- [ ] The condition block renders on **every** ending for a line where something was received — never
      collapsed, no disclosure, no "add condition" step, no empty state — opening at
      `presented · 0 refused · presented accepted`.
- [ ] The `Refuse some of this` control is permanently visible in the block header, neutral-toned,
      never destructive-styled, never inside a menu and never behind a disclosure.
- [ ] Without `REJECTIONS:CREATE` the control is **absent, not disabled**, via
      `WarehousePermissionGate`; a test asserts nothing in the rendered output hints at a capability
      the member does not hold, and that an ending refusing nothing still records (AC-01a, AC-01b).
- [ ] The accepted figure is **derived** from presented minus refused and updates live; a test proves
      it is never an input and never typed.
- [ ] The Rejection Source is a chip derived from the line's Delivery Mode and is **never a field**, so
      the wrong value cannot be expressed here (AC-24).
- [ ] Several refusals may be added to one line, each with its own quantity, Reason and description
      (AC-05, AC-08, AC-13).
- [ ] The remove control carries an accessible name identifying its subject — "Remove the refusal of 5
      damaged by packing".
- [ ] The live region announces as the presented figure and the refusals change, and never refuses a
      figure — the bounds are the server's.
- [ ] Keyboard order is dialog heading → presented quantity → refuse control → each refusal (quantity →
      Reason → description → remove).
- [ ] `en`/`uk` keys are added to `purchase-draft.json` with full parity, and
      `apps/web/src/test/locale-baseline.json` is regenerated **in the existing file's key order**;
      the diff removes no key and changes no value.
- [ ] The approved 1440 and 390 layouts render as drawn (`W6TARi` cell `H0jcSr`, `kejd2`).
- [ ] `pnpm --filter @warehouser/web test`, `lint`, `pnpm exec tsc --noEmit` and
      `pnpm --filter @warehouser/web build` are green.

## Notes

**Hard rule** ([design-handoff.md § Implementation constraints](../design-handoff.md)): no new route,
no `ROUTE_SEGMENTS` entry, no nav item. The two ending modals stay **one component**,
`LineEndingDialog.tsx`, with `kind` choosing copy and parse.

Read [writing web components §6](../../../system/guides/writing-web-components.md) before writing any
conditional: Delivery mode and Rejection Source are total `Record<State, ReactElement>` render lookups,
never `if`/`else if` chains or ternary ladders. Use `shared/components/Conditional` for anything
rendered only some of the time.

**Rejection Reason labels are server data**, not translated client copy — the catalogue is extended by
the team, so a new Reason must not require a client release ([sad.md §5](../sad.md)).

None of the three icons is load-bearing: each accompanies text carrying the same meaning.

Shares the web locale lane with T16, T17, T18 and T19 — every one of them regenerates the baseline.
