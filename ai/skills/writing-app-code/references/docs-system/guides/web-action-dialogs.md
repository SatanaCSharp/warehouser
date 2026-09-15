# Writing Web Action Dialogs

This guide applies to `apps/web`. It is the procedure for a dialog opened **from a row** — a list
item, a table row, a menu item inside one — rather than from a control standing beside it.

Read [Writing web dialogs](web-dialogs.md) first: it decides _what_ a dialog is (`FormModalDialog`
when anything is validated, `ConfirmAlertDialog` when there is one decision and nothing to fill in)
and owns the submit sequence. This guide decides _how it gets opened_, and nothing here changes what
goes inside one.

The decision behind it is
[Open a row's dialogs through one reducer](../adr/27-08-2026-reducer-driven-action-dialogs.md).

## 1. First decide whether you need this at all

Most dialogs do not. Ask one question: **is there a control the dialog can sit beside?**

| The dialog is opened by…                           | Use                                    |
| -------------------------------------------------- | -------------------------------------- |
| a button on the page — "Create member", "Add item" | a `Modal` root + `TriggeredDialog`     |
| a row of a list, a cell of a table, a row's menu   | `useActionDialog` + `ActionDialogHost` |

The first is the Action shape ([Writing web components](writing-web-components.md) §3): the trigger,
the dialog and the mutation live together in one small component, and HeroUI's `Modal` owns whether
it is open. Nothing in this guide applies — do not reach for an action dialog because a workflow
feels similar.

Reach for this guide only when the dialog is mounted **for a record**, because a row is not a
control the dialog can sit beside.

## 2. The four steps

Everything a surface writes is these four things. `MemberDirectory.tsx` is the reference.

**Name the kinds.** One union member per dialog the surface's rows open, declared in the surface's
own file. This is not shared, not exported, and never collects another surface's workflows:

```ts
/** Which per-member dialog a row opens. */
type MemberDialogKind = 'deleteMember' | 'editEmail' | 'resetPassword';
```

**Take the controller.** `Kind` is the union above; `Subject` is the record a dialog is opened for:

```ts
const dialog = useActionDialog<MemberDialogKind, AccessMember>();
```

**Declare the opener in the shape the rows need.** One line, named after the prop it is passed to
([Writing web components](writing-web-components.md) §7):

```ts
const onOpenDialog =
  (kind: MemberDialogKind) =>
  (member: AccessMember): void =>
    dialog.open(kind, member);
```

**Mount the lookup.** One entry per kind, building that dialog from the record it was opened for:

```tsx
<ActionDialogHost
  controller={dialog}
  renderDialogs={{
    editEmail: (member) => (
      <EditEmailDialog member={member} onSave={onSaveEmail(member)} />
    ),
    resetPassword: (member) => (
      <ResetPasswordDialog member={member} onSave={onSavePassword(member)} />
    ),
    deleteMember: (member) => (
      <DeleteMemberDialog member={member} onDelete={onConfirmDelete(member)} />
    ),
  }}
/>
```

`renderDialogs` is a **total** `Record<Kind, (subject) => ReactElement>`. Adding a kind to the union
does not compile until it is given a dialog — the same guarantee
[Writing web components](writing-web-components.md) §6 requires of every state lookup. Because the
entries are functions, only the open one is built.

## 3. Shaping the opener

`dialog.open(kind, subject)` is the one primitive. How a row reaches it depends on what the row hands
over, and all three shapes are one line:

```ts
// A list callback that receives the record.
const onOpenDialog =
  (kind: MemberDialogKind) =>
  (member: AccessMember): void =>
    dialog.open(kind, member);

// A handler already bound to its record, for a menu item's `run`.
const onOpenDialog = (kind: WorkspaceMemberDialogKind) => (): void =>
  dialog.open(kind, member);

// One dialog, one kind — name the handler after what it opens.
const onAmend = (order: CustomerOrder): void => dialog.open('amend', order);
```

Do not write a `Conditional` or a null check around the host, and do not keep a second boolean
beside the controller. `closed` is a state of the machine, and `ActionDialogHost` returns nothing
while it holds.

## 4. What a surface must not do

- **Do not hand a dialog an `onClose`.** `ActionDialogHost` reports the close to the controller; the
  dialog closes itself through `<Button slot="close">` (cancel) or `useCloseDialog()` (a mutation
  succeeded). This is [Writing web dialogs](web-dialogs.md) §5, unchanged.
- **Do not keep `isOpen` anywhere.** The record is the state. A boolean beside it can disagree with
  it.
- **Do not collect several surfaces' workflows into one union.** Each surface declares its own
  `Kind`. A module-wide "which workflow is open" type routed through a central switch is what
  [Writing web components](writing-web-components.md) §8 forbids, and sharing the mechanism is not
  a licence to share the vocabulary.
- **Do not read `dialog.subject` yourself.** It exists only inside `renderDialogs`, where the type
  narrowing has already happened.
- **Do not reach for this when a `Modal` root would do.** See §1.

## 5. Where the pieces live

| File                                     | What it owns                                              |
| ---------------------------------------- | --------------------------------------------------------- |
| `shared/hooks/state/useActionDialog.ts`  | which dialog is open and for what; the two transitions    |
| `shared/components/ActionDialogHost.tsx` | selecting the open dialog and mounting it in `DialogHost` |
| `shared/components/DialogHost.tsx`       | the open state a triggerless dialog closes itself through |
| `shared/components/TriggeredDialog.tsx`  | the counterpart for a dialog that _does_ have a trigger   |

`useActionDialog` is filed under `hooks/state/` because its job is owning local UI state and the
named transitions over it — see [Placing web hooks](placing-web-hooks.md) §2.

## 6. A worked example with a table

`DemandDirectory.tsx` opens its dialogs from sub-rows of a HeroUI `Table`, and shows why the state
belongs to the directory rather than to a row. A React Aria collection builds its rows from plain
functions that may call no hook, and caches what they build
([Present tabular data with HeroUI's Table](../adr/27-08-2026-heroui-table-for-web-data-tables.md)),
so a row cannot own a controller even if it wanted to. The directory owns it, the table takes
`onAmend`/`onCancel` as props, and the menu inside a cell calls them:

```tsx
const dialog = useActionDialog<CustomerOrderDialogKind, CustomerOrder>();

const onAmend = (order: CustomerOrder): void => dialog.open('amend', order);
const onCancel = (order: CustomerOrder): void => dialog.open('cancel', order);
```

That is two hops on the desktop branch — directory → table → menu — which is inside the budget
([Writing web components](writing-web-components.md) §4). The mobile branch is one more, because
the card list and the card both sit between the directory and the menu; that is a deliberate
exception recorded in the Table ADR's consequences, and it holds only for callbacks that report an
event upward. For a _value_, a third hop still means the state is in the wrong place, not that the
budget should stretch.

## 7. Testing

- Assert through the outcome, not the mechanism: opening a row's action leaves a dialog in the
  document named for the record, and a successful mutation leaves none.
- Query a form dialog with `getByRole('dialog')` and a confirmation with `getByRole('alertdialog')`
  ([Writing web dialogs](web-dialogs.md) §7).
- Do not test `useActionDialog` again per surface. The reducer has `useActionDialog.spec.ts` and the
  host has `ActionDialogHost.spec.tsx`; a surface's spec covers _its_ workflows.

## 8. Verify before completing

- the surface declares its own `Kind` union, and nothing else imports it;
- there is no `useState` for a dialog, no `isOpen`, and no null check around the host;
- `renderDialogs` has exactly one entry per kind, and each builds its dialog from the subject;
- no dialog is handed an `onClose`;
- the opener is declared above the `return` and named after the prop it is passed to.

Then run the checks from [Frontend architecture](../frontend-architecture.md):

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```
