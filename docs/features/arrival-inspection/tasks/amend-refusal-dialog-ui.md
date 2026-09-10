---
id: T18
title: 'Add the amend-refusal dialog, opened from the read row under REJECTIONS:UPDATE'
layer: 'ui'
deps: [T17]
acs: ['AC-18', 'AC-18a', 'AC-19', 'AC-20']
files_hint:
  - 'apps/web/src/modules/purchase-draft/components/'
  - 'apps/web/src/modules/purchase-draft/api/purchase-draft-api.ts'
  - 'apps/web/public/locales/'
  - 'apps/web/src/test/locale-baseline.json'
owner: 'Frontend Lead'
estimate: 'M'
status: 'todo'
---

# T18 — Add the amend-refusal dialog

## Why

AC-18's telephone call arrives after the draft closed, so the member needs to record what happened to
the refused goods from the row that shows them. Derives from
[design-handoff.md § Component mapping](../design-handoff.md) (`Modal · Amend this refusal`, `iNstk`,
440px) and [sad.md §6.4](../sad.md), approved frame `W6TARi` cell `Ue4xn`.

## What

Add the amend dialog. It validates a description and a Disposition, so it is a `FormModalDialog` and
**never** a `ConfirmAlertDialog` ([web dialogs §1](../../../system/guides/web-dialogs.md)). It is
opened **from a row**, so it takes `useActionDialog` + `ActionDialogHost` with the closed-line
surface's own `Kind` union ([web action dialogs](../../../system/guides/web-action-dialogs.md)) — no
surface hands it an `onClose` and none keeps an `isOpen`.

Inject the amendment mutation into the shared API slice; the component calls the generated
`use<Endpoint>Mutation` hook directly, with field-error policy in the endpoint's
`transformErrorResponse`.

## Definition of Done

- [ ] The dialog is a `FormModalDialog` at 440px, opened through `useActionDialog` + `ActionDialogHost`
      with the closed-line surface's own `Kind` union; a test asserts no `onClose` prop and no `isOpen`
      state exists on any surface.
- [ ] Without `REJECTIONS:UPDATE` the row menu **offers nothing** — not a disabled item (AC-20).
- [ ] Once a Disposition is decided, `Undecided` is **absent from the list** rather than shown and
      disabled (AC-18a).
- [ ] A correction between two decided Dispositions is offered — no decision is terminal (AC-18).
- [ ] A Disposition outside the offered set cannot be expressed by the surface, and the server's
      refusal for one is rendered against its field (AC-19).
- [ ] A description-only amendment is possible without touching the Disposition (AC-18b belongs to T11;
      the surface must not force both).
- [ ] The amendment refreshes the closed draft that carries it through the RTK Query tag, so the read
      row updates without a manual refetch.
- [ ] The kebab that opens it carries an accessible name identifying its refusal; focus returns to it
      on dismissal; Cancel precedes the primary in DOM and keyboard order.
- [ ] `en`/`uk` keys are added with full parity and the locale baseline regenerated in its existing key
      order.
- [ ] Frame `W6TARi` cell `Ue4xn` renders as approved at 1440 and 390.
- [ ] `pnpm --filter @warehouser/web test`, `lint`, `pnpm exec tsc --noEmit` and
      `pnpm --filter @warehouser/web build` are green.

## Notes

**Hard rule** ([design-handoff.md § Implementation constraints](../design-handoff.md)): gate the menu
item with `WarehousePermissionGate` — or a `usePermittedItems` descriptor inside the React Aria
collection — per the declarative-permission-gates ADR. There is no capability table and no component
takes a capability as a prop.

The UI's hiding is **defence in depth; the server's assertion is the guarantee** (T11 + T13). A
hand-written client aiming an amendment at the route without the grant is refused there.

Shares the closed-line surface's `Kind` union with T17, which is why it depends on it, and the locale
lane with every other `ui` task.
