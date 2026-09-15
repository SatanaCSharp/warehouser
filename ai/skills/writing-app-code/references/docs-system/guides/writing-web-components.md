# Writing Web Components

This guide applies to `apps/web`. It defines how to size, split, and wire React components so that a
contributor can understand one file without reading the rest of the tree.

[Placing web components](placing-web-components.md) decides **where** a component's file goes. This
guide decides **what goes inside it**. Read [Frontend architecture](../frontend-architecture.md)
first for the layer responsibilities both guides assume, and
[Web error handling](web-error-handling.md) for the form-error and feedback rules referenced below.

The governing constraint is cognitive load: a reader must be able to answer "what does this render,
what does it need, and what can it change?" from the single file in front of them.

## 1. Export one component per file

A component file exports exactly one component, named after the file. `MemberRow.tsx` exports
`MemberRow`. Do not collect several exported components in one file because they are related — that
is what the directory structure in [Placing web components](placing-web-components.md) is for.

A file may keep small private render helpers that only its exported component uses and that are
never exported (`DatasetCard.tsx` keeps `DatasetMessage` this way). Move a helper into its own file
as soon as any of these becomes true:

- a second component renders it;
- it needs a props type worth naming and exporting;
- it grows its own state, effects, or data access.

## 2. Budget the cognitive load

Treat these as smells that trigger a split, not as gates to satisfy with clever formatting:

| Signal                                       | Budget                        |
| -------------------------------------------- | ----------------------------- |
| Component length                             | about one screen (~100 lines) |
| Props on one component                       | 7                             |
| Hook calls in one component                  | 5                             |
| Levels of conditional nesting inside its JSX | 2                             |
| Reasons the file would need to change        | 1 (see §3)                    |

Crossing one budget is a prompt to look for a seam, not an obligation to split. Crossing several at
once means the component is doing more than one job.

## 3. Give each component one reason to change

Split orchestration from presentation. A component that decides _what data to load and what happens
on submit_ should not also own the markup for every row it renders.

The repository uses four recurring shapes. Naming the shape you are writing usually answers what
belongs in the file:

- **Tab / panel container** — resolves capabilities and renders the datasets its route already
  awaited, choosing between a read-only card and the editable surface. It does not resolve the
  datasets itself and asks no readiness question: the route awaited them before the destination
  mounted ([Frontend architecture](../frontend-architecture.md) §Page). Example: `MembersTab.tsx`.
- **Directory** — owns selection and dialog state for a collection, renders the list plus the
  dialogs its rows open. Example: `MemberDirectory.tsx`.
- **Action** — one workflow end to end: its permission gate, its trigger, the dialog it opens, and
  the mutation it runs. Example: `CreateRoleAction.tsx`.
- **Presentational leaf** — props in, callbacks out; no data access, no side effects. Example:
  `MemberRow.tsx`.

The Action shape is the one that keeps workflows from leaking upward. A trigger, its dialog, and its
mutation belong together in a component small enough to read at once:

```tsx
export const CreateRoleAction = (): ReactElement => {
  const { t } = useTranslation('access');
  const permissions = useAccessPermissions();
  const saveRole = useSaveRole();

  return (
    <WarehousePermissionGate permission={PermissionId.ROLES_CREATE}>
      <Modal>
        <CreateActionButton label={t('administration.createRole')} />
        <TriggeredDialog>
          <CreateRoleDialog permissions={permissions.items} onSave={saveRole} />
        </TriggeredDialog>
      </Modal>
    </WarehousePermissionGate>
  );
};
```

The `Modal` root is HeroUI's dialog trigger: it owns whether the dialog is open, opens it from the
control beside it, and returns focus to that control once it closes;
`shared/components/TriggeredDialog` mounts the dialog only while it is open, so the dialog's reads
and form state start when the actor opens it. An Action therefore holds no `isOpen` state, declares
no `onPress`/`onClose` pair, and hands the dialog no `onClose` — see §8.

Its parent renders `<CreateRoleAction />` and passes nothing. The parent does not know the action
needs Permissions, whether the actor may use it, or that it opens a dialog. The gate is the whole
answer to "may this actor use it?" —
[Gate web controls declaratively](../adr/19-08-2026-declarative-permission-gates.md) is the decision
that forbids the `canCreateRoles` boolean this example used to test.

## 4. Read data where you use it

**Do not pass data down more than two hops.** A value may travel parent → child → child. If it needs
a third hop, the component that needs it must read it itself.

Read server data and derived authorization through hooks, at the component that uses them:

- RTK Query deduplicates subscriptions, so several components calling the same query hook share one
  request and one cache entry. Calling `useAccessRoles()` in three places does not cause three
  requests.
- Wrap each dataset in a module hook that owns its own gating, so no caller repeats a `skip`
  condition or unwraps a page envelope. `useAccessRoles` decides from capabilities whether the query
  fires at all; callers just read `.items`. A hook returns the data it has and reports no readiness:
  the route awaited the dataset, so there is nothing for a caller to wait on
  ([Frontend architecture](../frontend-architecture.md) §Page).
- Gate controls with `WarehousePermissionGate` / `WorkspacePermissionGate` at the control itself, never on a capability
  boolean or a `permissionIds` array threaded down from a page. A refreshed projection then narrows
  every gate at once. A Permission that decides a _value_ — a query's `skip`, an `isDisabled` — is
  read with `useHasPermission` in the file that uses it and goes no further. See
  [Gate web controls declaratively](../adr/19-08-2026-declarative-permission-gates.md).

Do not introduce a React context to escape prop drilling for state that already lives in Redux or
RTK Query — [Frontend architecture](../frontend-architecture.md) forbids the parallel source of
truth, and a query hook already gives you the shared read. When the value is local UI state with no
other owner and the third hop is genuinely unavoidable, follow
[Sharing web state with context](sharing-web-state-with-context.md): a state provider and a dispatch
provider, consumed through named hooks at the components that use them.

Props are still the right tool for:

- a value the parent owns and the child cannot derive — the member a row was opened for, the
  currently selected role;
- callbacks that report an event upward (`onSelect`, `onSave`, `onClose`);
- data the parent already loaded, when passing it keeps a leaf presentational and testable without a
  store.

## 5. Depend on the narrowest contract

Give a component the smallest interface that does its job.

Prefer one action over one object carrying every action. A dialog that only creates a member
should depend on that one mutation, not on a nine-method administration interface that also deletes
roles and transfers management.

Take the action from the generated RTK Query hook directly. A mutation gets no wrapper hook of its
own: its toast is declared in `shared/alerts/mutation-actions.ts`, its field errors on the endpoint,
and `FormModalDialog` normalizes the result
(`docs/system/adr/19-08-2026-generated-mutation-hooks-in-components.md`).

```tsx
const [deleteMember] = useDeleteMemberMutation();

const onConfirmDelete = (): Promise<MutationResult> =>
  deleteMember({ warehouseId, userId: member.userId });
```

Write a `use…` mutation hook only when it **composes** — more than one request, or a decision
between requests.

Keep form components depending on an abstraction, not on the transport. A form owns field
registration, client validation, and submission state, then reports validated values through
`onSave`; its owner performs the request. This is the ownership rule in
[Frontend architecture](../frontend-architecture.md) and it is what lets a form be tested without a
store or a stubbed network. A dialog shows the server's field errors and decides from the outcome
whether to close — which it does itself (§8), so `onSave` hands over the request and returns its
`MutationResult` rather than the caller closing on the dialog's behalf.

## 6. Keep branching flat — never write an `if`/`else if` chain

**A component never decides what it renders, or what a value is, with a chain of conditionals.**
This rule is unconditional. It is not a budget to stay under, not a smell to weigh against other
concerns, and not waived by a chain being short, flat, well-commented, or an improvement on what it
replaced.

**A chain is any `if` that has an `else`.** That is the whole test, and it is mechanical:

```ts
if (a) { … } else if (b) { … } else { … }   // a chain — forbidden
if (a) { … } else { … }                     // a chain — forbidden
if (a) return x;                            // a guard — required, see below
```

The single `if` this guide keeps is the early-return guard, and it keeps no `else` because the
return _is_ the else. Everything else that looks like a chain is data wearing control flow, and the
five techniques below say which shape that data takes.

Why the rule is absolute rather than a preference:

- **A chain has no exhaustiveness.** Nothing tells you a case is missing; the final `else` silently
  absorbs it and renders the wrong thing. A total lookup does not compile until every case is
  answered.
- **Its precedence is invisible.** Which condition wins is encoded in line order, so reordering two
  arms during an unrelated edit changes behaviour with nothing to review against.
- **It grows.** Every chain was two arms once. There is no principled place to stop, so the rule
  stops it at zero.
- **It hides the shape of the problem.** Reading a chain means simulating it. Reading a table means
  reading a table.

The same prohibition applies to the ternary ladder that a chain becomes when someone converts it to
satisfy the letter of this rule — `a ? x : b ? y : c ? z : w` is a chain, and is covered below.

**Return early for mutually exclusive whole-component states.** Put the exits at the top so the
happy path is unindented and reads last:

```tsx
const canReadMembers = useHasPermission(PermissionId.USERS_WATCH);
const members = useAccessMembers();

if (!canReadMembers || members.isError) {
  return <MembersDatasetCard dataset={members} />;
}

return <section>{/* the real thing */}</section>;
```

A gate renders its children or nothing, so choosing between **two surfaces** — the editable one and a
read-only card — stays an early return, and the Permission is read here for that reason. A control
that is simply withheld is a gate instead
([Gate web controls declaratively](../adr/19-08-2026-declarative-permission-gates.md)).

Readiness is not one of the whole-component states, because there is no waiting window here to
exit: the route awaited `members` before this component mounted
([Frontend architecture](../frontend-architecture.md) §Page). Nor is _empty_ an early return —
`MembersDatasetCard` resolves `items.length === 0` into the card's own empty message, and the error
arm above is an early return only because that card is the sole renderer of the members error. What
is left is the permission arm and the failed read.

**Map values with a lookup, not a chain.** An `if`/`else if` sequence that turns one value into
another value is data pretending to be control flow:

```ts
// Avoid
if (code === ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED)
  return { email: 'duplicate' };
if (code === ErrorCode.USERS_MANAGER_ROLE_PROTECTED)
  return { email: 'protected' };
if (code === ErrorCode.USERS_PERMISSION_EXCEEDED) return { email: 'exceeded' };
return undefined;

// Prefer
const fieldErrorsByCode: Record<string, Record<string, string>> = {
  [ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED]: { email: 'duplicate' },
  [ErrorCode.USERS_MANAGER_ROLE_PROTECTED]: { email: 'protected' },
  [ErrorCode.USERS_PERMISSION_EXCEEDED]: { email: 'exceeded' },
};

const fieldErrorsFor: FieldErrorMap = (code) => fieldErrorsByCode[code];
```

**Build a list of descriptors, then render it.** When branches decide _which items appear_, compute
the items first and let the JSX stay a single `map`. Where the branch is a Permission, the descriptor
names it in a `permission` field and the collection gate drops the ones the actor may not have — the
same field `WarehousePermissionGate` takes, for a `Dropdown.Menu` no gate element can sit inside
([Gate web controls declaratively](../adr/19-08-2026-declarative-permission-gates.md)):

```tsx
const actions = usePermittedItems<RowAction>([
  {
    id: 'editEmail',
    label: t('members.menu.editEmail'),
    permission: PermissionId.USERS_EMAIL_UPDATE,
    run: () => onEditEmail(member),
  },
  {
    id: 'deleteMember',
    label: t('members.menu.deleteMember'),
    permission: PermissionId.USERS_DELETE,
    run: () => onDeleteMember(member),
  },
]);
```

For a branch that is _not_ a Permission — record state, identity, a feature the row does not carry —
build the list with Lodash `compact` and a predicate per entry.

**Name the state, then look up the element.** This is the technique for the case an `if`/`else if`
chain is reached for most often: several mutually exclusive states, each rendering something
different, none of which can be an early return because the component still renders a shell around
them. Resolve the state to a **name** before the return, then index a lookup with that name.

Take it in two steps. First, the precedence — which state wins when more than one holds — becomes an
ordered table instead of the order of `else if` lines:

```ts
type WarehouseListState = 'failed' | 'empty' | 'noMatches' | 'ready';

/** The states that displace the rows, most significant first. */
const displacingStates: readonly {
  state: WarehouseListState;
  holds: (reading: WarehouseListReading) => boolean;
}[] = [
  { state: 'failed', holds: ({ isError }) => isError },
  { state: 'empty', holds: ({ warehouseCount }) => warehouseCount === 0 },
  { state: 'noMatches', holds: ({ matchCount }) => matchCount === 0 },
];

const resolveListState = (reading: WarehouseListReading): WarehouseListState =>
  displacingStates.find(({ holds }) => holds(reading))?.state ?? 'ready';
```

The table is a value, so the precedence can be commented, reordered deliberately, and asserted in a
test. The resolver is pure and takes the narrowest reading of the world that decides the answer —
two counts and an outcome flag, not the collection itself.

Second, the name selects the element:

```tsx
const content: Record<WarehouseListState, ReactElement> = {
  failed: <p role="alert">{t('warehouses.error')}</p>,
  empty: <p role="status">{t('warehouses.empty')}</p>,
  noMatches: <p role="status">{t('warehouses.noMatches', { query })}</p>,
  ready: <ul aria-label={label}>{rows}</ul>,
};

return (
  <div className={className}>
    <WarehouseSearchField value={query} onChange={setQuery} />
    {content[listState]}
  </div>
);
```

Annotating the lookup `Record<WarehouseListState, ReactElement>` is the point of the whole shape, not
a formality: it is **total**, so adding a state to the union fails to compile until it is given
something to render. That is the guarantee the chain's trailing `else` can never give.

Both halves are cheap. Naming the state runs a handful of predicates over already-computed values,
and building every element to render one runs no hook and has no effect —
[Writing web conditional components](writing-web-conditional-components.md) §3 states that in full.
An arm whose props only exist under its own condition is the exception, and §2 there says how to
resolve it.

Use the lookup when there are three or more states, or when a state may be added later. With exactly
two, and no shell to render around them, an early return is still simpler — and a single
`condition ? value : other` picking a _value_ was never a chain to begin with.

**Never branch between elements with a ternary.** A ladder of `a ? x : b ? y : c ? z : w` is a set
of early returns wearing a disguise — extract it into a small component or helper that returns early
instead. A single `condition ? <Thing /> : null` is a `Conditional`:
[Writing web conditional components](writing-web-conditional-components.md) states that rule in
full, including what to do when the branch's props only exist under the condition. A ternary that
picks a _value_ — `className={isSelected ? 'a' : 'b'}`, `{isSubmitting ? t('saving') : t('save')}` —
is not a branch between elements and stays as it is.

Prefer rendering nothing over accepting a visibility flag. A component that gates itself — with
`WarehousePermissionGate` for a Permission, an early `return` for a whole-component state — removes a
branch
from its parent and keeps the rule next to the control it protects.

## 7. Declare every event handler before the return

An event handler is named, typed and declared in the component body, above the `return`. The JSX
passes the reference and nothing else. No arrow function is written inside a JSX attribute — not for
`onPress`, `onClick`, `onSelect`, `onChange`, `onSubmit`, `onAction`, `onClose`, or any other
handler prop.

```tsx
// Avoid — the behaviour is buried in the markup, and the reader has to
// re-derive what the handler does at every site that passes one.
<Button size="sm" variant="outline" onPress={() => setSelectedMemberId(member.userId)}>

// Prefer — the behaviour is declared once, named, and the markup reads as markup.
const onPress = (memberId: string) => (): void => setSelectedMemberId(memberId);

<Button size="sm" variant="outline" onPress={onPress(member.userId)}>
```

Three rules make this mechanical:

- **Name the handler after the prop it is passed to** — `onPress`, `onClose`, `onSelect`. When one
  component has two handlers for the same event, qualify each with what it acts on:
  `onPressArchive`, `onPressRestore`.
- **Curry when the handler needs a per-item argument.** A handler that a list row supplies a value
  to is declared as `(id: string) => (): void => …` and passed as `onPress(row.id)`. The outer call
  binds the row; the inner function is the handler.
- **Declare before every return, not just the last one.** A component that gates itself with an
  early `return null` still declares its handlers above that guard, so there is one place to look.

Give each handler an explicit return type, as every other declaration in `apps/web` does. A handler
that must discard a promise the DOM will not await says so:

```tsx
// `handleSubmit` returns a promise the DOM handler must not; discarding it
// here keeps the rejection with React Hook Form, which already owns it.
const onSubmitForm = (event: FormEvent<HTMLFormElement>): void =>
  void handleSubmit(onSubmit)(event);
```

An arrow component with an implicit return (`(props) => (<div />)`) has no body to declare into.
Give it a block body and a `return` the moment it needs a handler; do not inline one to avoid the
conversion.

Two things this rule does not ask for. It is not `useCallback`: memoize only when a profile or a
memoized child makes it matter, and let the plain declaration be the default. And it does not
override §5 — a handler that only forwards to a prop the parent already owns (`onSelect={onSelect}`)
is passed directly, because there is nothing left to name.

## 8. Own transient UI state where it is triggered — and do not keep what a Modal already owns

Keep selection and search state in the component that owns the control, and no higher. A search term
nothing outside a list reads belongs inside that list, not in its parent's props.

**Whether a dialog is open is not state a component keeps.** Wrap the trigger and the dialog in a
HeroUI `Modal` and let it own that:

- the control beside the dialog opens it, so no `onPress` sets a flag;
- `TriggeredDialog` mounts the dialog only while it is open, so nothing it reads is requested before
  the actor asks for it, and it still seeds itself from what it was opened for with no reset effect;
- focus returns to the trigger when it closes, with nothing to arrange;
- the cancel control is a `<Button slot="close">` — `shared/components/FormModalDialog` already
  renders one — and a dialog that must close because a mutation succeeded calls
  `useCloseDialog()`. Neither an Action nor a list passes an `onClose` down.

Do not build a module-wide "which workflow is open" union routed through a central switch. That
turns every unrelated workflow into a shared type, a shared reducer, and a shared render site. Where
several dialogs genuinely share one trigger surface — the rows of a list — the state to keep is the
record a row opened one for, never a boolean:

```ts
type MemberDialogKind = 'deleteMember' | 'editEmail' | 'resetPassword';
```

A row is not a control the dialog can sit beside, so that pair — which kind, for which record — is
held by `shared/hooks/state/useActionDialog` and mounted by `shared/components/ActionDialogHost`,
which wraps `shared/components/DialogHost` to publish the open state a `Modal` would have owned and
report the close once. Do not write that state, its null check or its lookup by hand; the procedure
is [Writing web action dialogs](web-action-dialogs.md) and the decision is
[Open a row's dialogs through one reducer](../adr/27-08-2026-reducer-driven-action-dialogs.md).
The union above stays the surface's own — sharing the mechanism is not a licence to share the
vocabulary, which is what the paragraph above forbids.

## 9. Prefer the simplest thing that works

- **No indirection for a handful of cases.** A registry of slot descriptors to render three tabs
  costs more to follow than three JSX elements. Add the abstraction when the list is open-ended or
  genuinely configured elsewhere.
- **Duplication is cheaper than the wrong abstraction.** Two ten-line renderings that differ in
  gating and styling should stay two renderings sharing a leaf component. Merging them behind a
  `variant` or `mode` flag makes both harder to read.
- **Resist boolean prop proliferation.** When a component accumulates `isCompact`, `withHeader`,
  `showFooter`, the caller is describing a different component. Split it, or accept composition
  through `children` and slots.
- **Derive during render instead of syncing with an effect.** Recompute the selected item from the
  current list on each render; do not mirror it into state and repair it with `useEffect`. When a
  child must re-seed from new data, remount it with a `key` rather than resetting it.
- **Delete dead branches.** A prop, mode, or view no caller uses is not flexibility; it is a
  permanently untested path. Remove it.

## 10. Verify before completing

Check the component you wrote against this list:

- one exported component, named after its file;
- no value drilled more than two hops;
- no data or capability read that could be read one level lower, and no capability accepted as a
  prop at all;
- each dependency is the narrowest one that does the job;
- **no `if` that has an `else`** — no `else if` chain, no `if`/`else` pair, and no ternary ladder
  standing in for one; the only surviving `if` is an early-return guard (§6);
- every set of three or more mutually exclusive states is resolved to a name and rendered through a
  lookup annotated `Record<State, ReactElement>`, so the compiler proves it total (§6);
- no ternary choosing between elements;
- every branch gated by `Conditional`, or resolved to a named element above the return;
- every event handler declared and named above the return, and the JSX passes the reference;
- transient UI state lives with the control that owns it, and no component keeps a dialog's open
  flag;
- tests colocated with the component, querying by role, label, and name.

Then run the checks from [Frontend architecture](../frontend-architecture.md):

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```
