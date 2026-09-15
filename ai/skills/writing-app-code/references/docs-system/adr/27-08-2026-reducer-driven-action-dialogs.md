# Open a Row's Dialogs Through One Reducer, Not Six Copies of the Same State

Status: Accepted

Date: 2026-08-27

## Context

A dialog opened by a control that sits beside it needs no state: a HeroUI `Modal` root owns whether
it is open ([Writing web dialogs](../guides/web-dialogs.md) §5). A dialog opened by a **row** does,
because the dialog is mounted for the record the row was opened for, and that record — not a
boolean — is what has to be held. `shared/components/DialogHost` publishes the open state such a
dialog closes itself through.

What `DialogHost` did not answer is _which_ dialog, for _which_ record. Six surfaces answered it
themselves, and they answered it identically:

| Surface                | Dialogs |
| ---------------------- | ------- |
| `MemberDirectory`      | 3       |
| `ItemDirectory`        | 3       |
| `DemandDirectory`      | 2       |
| `WorkspaceMemberRow`   | 3       |
| `RoleDirectory`        | 1       |
| `MemberAssignmentList` | 1       |

Every one of them wrote the same four things:

```tsx
const [dialog, setDialog] = useState<MemberDialog | null>(null);

const onCloseDialog = (): void => setDialog(null);

const onOpenDialog =
  (kind: MemberDialog['kind']) =>
  (member: AccessMember): void =>
    setDialog({ kind, member });

const openDialog =
  dialog === null ? null : (
    <DialogHost onClose={onCloseDialog}>
      {
        {
          editEmail: <EditEmailDialog member={dialog.member} … />,
          resetPassword: <ResetPasswordDialog member={dialog.member} … />,
          deleteMember: <DeleteMemberDialog member={dialog.member} … />,
        }[dialog.kind]
      }
    </DialogHost>
  );
```

Only the union's members and the record differ between copies. The rest is ceremony, and it carried
four costs:

- **The same four-line comment explaining the shape was copy-pasted into four files**, which is what
  duplication looks like once it has stopped being noticed.
- **`null` was the closed state**, so the union admitted no distinction between "nothing is open"
  and "something is open with no record". Reading `dialog.member` was guarded by a null check the
  author had to remember rather than by a type the compiler enforced.
- **Every dialog element was built on every render of the list**, open or not. The inline record is
  an object literal; all three arms were constructed to select one. Elements are cheap, but the
  construction is unconditional and grows with the surface.
- **The `openDialog` variable had to be threaded to the bottom of the JSX**, so a reader following
  the return had to jump back up to find what `{openDialog}` was.

[Writing web components](../guides/writing-web-components.md) §8 already forbids the obvious wrong
fix — "do not build a module-wide 'which workflow is open' union routed through a central switch" —
and states the right _state_ to keep. It said nothing about the mechanism, so six surfaces invented
the same one.

## Decision

**A surface that opens dialogs from its rows holds that state in `useActionDialog` and mounts them
with `ActionDialogHost`. It does not write the null check, the `DialogHost`, or the inline record
itself.**

Two pieces, and the split is the point:

1. **`shared/hooks/state/useActionDialog.ts`** owns the state, as a reducer over two named events:

   ```ts
   type ActionDialog<Kind extends string, Subject> =
     { status: 'closed' } | { status: 'open'; kind: Kind; subject: Subject };
   ```

   `closed` is a **state**, not `null`, so `subject` is unreachable while nothing is open — the
   compiler is what stops a caller reading the record a dialog was closed for, rather than a
   convention. The two transitions (`opened`, `closed`) are an exported pure `actionDialogReducer`,
   asserted directly in its own spec without rendering anything. A surface receives
   `{ dialog, open, close }`.

2. **`shared/components/ActionDialogHost.tsx`** decides which dialog that is, and mounts it in
   `DialogHost`. It takes the controller and a **total** render lookup:

   ```tsx
   <ActionDialogHost
     controller={dialog}
     renderDialogs={{
       amend: (order) => <AmendCustomerOrderDialog order={order} … />,
       cancel: (order) => <CancelCustomerOrderDialog order={order} … />,
     }}
   />
   ```

   `Record<Kind, (subject: Subject) => ReactElement>` is the same guarantee
   [Writing web components](../guides/writing-web-components.md) §6 already requires of a
   `Record<State, ReactElement>` render lookup: adding a kind to the union does not compile until it
   is given a dialog. Because the entries are functions, only the open one is ever called.

**`Kind` and `Subject` are the surface's own types.** Nothing shared knows what a workflow is, there
is no registry of dialogs, and no module-wide union — which is exactly what keeps this inside §8's
prohibition rather than becoming the central switch it forbids. What is shared is the _mechanism_,
not the _vocabulary_.

**The opening handler stays at the surface**, in whatever shape its rows need — `(record) => void`
for a list callback, `() => void` for a menu item already bound to its record:

```ts
const onOpenDialog =
  (kind: MemberDialogKind) =>
  (member: AccessMember): void =>
    dialog.open(kind, member);
```

That is one line, it is named after the prop it is passed to, and it keeps `open(kind, subject)` a
single primitive instead of two curried variants covering the two shapes.

**A dialog is still never handed an `onClose`.** `ActionDialogHost` reports the close to the
controller; the dialog closes itself through `<Button slot="close">` or `useCloseDialog()`, exactly
as [Writing web dialogs](../guides/web-dialogs.md) §5 already required.

The full procedure is [Writing web action dialogs](../guides/web-action-dialogs.md).

## Consequences

**What this buys.**

- All six surfaces lost the null check, the `DialogHost`, the `onCloseDialog` handler and the
  trailing `{openDialog}`. What is left at each is its own union, its own opener, and its own
  dialogs.
- The state machine has one spec. `useActionDialog.spec.ts` asserts the reducer directly — open,
  replace, close — and `ActionDialogHost.spec.tsx` proves what a surface sees, against a stub
  directory rather than a feature.
- Adding a dialog to a surface is adding a member to its union and an entry to its lookup, and the
  compiler refuses the first without the second.
- Dialogs are built when opened. The lookup holds functions, so the arms that are not open are not
  constructed.

**What it costs, honestly.**

- **A sixth `hooks/` directory name.** `useActionDialog` owns local UI state and the transitions
  over it, which is none of `queries`, `mutations`, `forms`, `projections` or `effects`.
  `hooks/state/` is added to [Placing web hooks](../guides/placing-web-hooks.md) §2 for it. One
  hook is thin justification for a category; it is accepted because the job is genuinely distinct
  and because filing it under a name that does not describe it is worse than naming it.
- **A generic component is harder to read than the markup it replaced.**
  `ActionDialogHost<Kind, Subject>` is two type parameters a reader must hold to follow the file.
  The surfaces got simpler and the shared file got harder; that is the trade.
- **`open`/`close` are recreated each render.** They close over `dispatch`, which is stable, but the
  wrappers are not memoized. Nothing here is passed to a memoized child, and
  [Writing web components](../guides/writing-web-components.md) §7 makes the plain declaration the
  default; memoize if a profile ever says otherwise.
- **A single-dialog surface pays for a `Kind` union of one.** `RoleDirectory` and
  `MemberAssignmentList` declare `type RoleDialogKind = 'deleteRole'`, which is more ceremony than
  the `useState<AccessRole | null>` they replaced. They are migrated anyway: one mechanism that
  every surface reaches for is worth more than each surface choosing, and a second dialog is a
  union member rather than a rewrite.
- **`subject` is mandatory.** A surface whose dialogs need no record passes the record its row
  belongs to anyway — `WorkspaceMemberRow` passes the Member its menu is on, which its
  `TransferWorkspaceOwnershipDialog` ignores. That is cheaper than an optional-subject overload, and
  it makes the closure the row previously relied on explicit.

## Alternatives considered

- **Leave it as six copies.** Rejected: the identical comment in four files is the tell. Duplication
  is cheaper than the wrong abstraction ([Writing web components](../guides/writing-web-components.md)
  §9), but this is one shape repeated six times with no variation to protect.
- **`useState` instead of `useReducer`.** The two transitions would fit. Rejected for what the
  reducer names: `opened`/`closed` are a closed set stated in one pure function, testable without a
  render, and extending the machine later is adding an event rather than adding a setter call at
  every site.
- **One `ActionDialogs` component owning the state, with a render-prop child receiving `open`.**
  Rejected: it puts every row of the list inside a function argument, which is a large indentation
  cost for the surfaces, and it hides the state from the surface that owns the workflow.
- **A registry of dialogs keyed by workflow name, shared across modules.** Rejected outright — that
  is the module-wide switch [Writing web components](../guides/writing-web-components.md) §8
  forbids, and it would make every unrelated workflow share one type and one render site.
- **Extend `DialogHost` to take the lookup itself.** Rejected: `DialogHost` answers "is it open",
  which a triggerless dialog needs whether or not there is more than one of them. Folding "which
  one" into it would give one component two reasons to change.
