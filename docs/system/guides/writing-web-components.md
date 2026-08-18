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
never exported (`DatasetCard.tsx` keeps `DatasetMessage` and `DatasetSkeleton` this way). Move a
helper into its own file as soon as any of these becomes true:

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

- **Tab / panel container** — resolves capabilities and datasets, then chooses between a read-only
  card and the editable surface. Example: `MembersTab.tsx`.
- **Directory** — owns selection and dialog state for a collection, renders the list plus the
  dialogs its rows open. Example: `MemberDirectory.tsx`.
- **Action** — one workflow end to end: its permission gate, its trigger, the dialog it opens, and
  the mutation it runs. Example: `CreateRoleAction.tsx`.
- **Presentational leaf** — props in, callbacks out; no data access, no side effects. Example:
  `MemberRow.tsx`.

The Action shape is the one that keeps workflows from leaking upward. A trigger, its dialog, and its
mutation belong together in a component small enough to read at once:

```tsx
export const CreateRoleAction = (): ReactElement | null => {
  const { t } = useTranslation('access');
  const { canCreateRoles } = useAccessCapabilities();
  const permissions = useAccessPermissions();
  const saveRole = useSaveRole();
  const [isOpen, setIsOpen] = useState(false);

  const onPress = (): void => setIsOpen(true);

  const onClose = (): void => setIsOpen(false);

  if (!canCreateRoles) {
    return null;
  }

  return (
    <>
      <CreateActionButton
        label={t('administration.createRole')}
        onPress={onPress}
      />
      <Conditional when={isOpen}>
        <CreateRoleDialog
          permissions={permissions.items}
          onClose={onClose}
          onSave={/* … */}
        />
      </Conditional>
    </>
  );
};
```

Its parent renders `<CreateRoleAction />` and passes nothing. The parent does not know the action
needs Permissions, whether the actor may use it, or that it opens a dialog.

## 4. Read data where you use it

**Do not pass data down more than two hops.** A value may travel parent → child → child. If it needs
a third hop, the component that needs it must read it itself.

Read server data and derived authorization through hooks, at the component that uses them:

- RTK Query deduplicates subscriptions, so several components calling the same query hook share one
  request and one cache entry. Calling `useAccessRoles()` in three places does not cause three
  requests.
- Wrap each dataset in a module hook that owns its own gating, so no caller repeats a `skip`
  condition or unwraps a page envelope. `useAccessRoles` decides from capabilities whether the query
  fires at all; callers just read `.items` and `.isReady`.
- Gate controls on a capability hook (`useAccessCapabilities`) or `PermissionGate`, not on a
  `permissionIds` array threaded down from a page. A refreshed projection then narrows every gate at
  once.

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

Prefer one hook per action over one object carrying every action. A dialog that only creates a
member should depend on `useCreateMember`, not on a nine-method administration interface that also
deletes roles and transfers management. Each hook stays a thin binding over one shared runner, so
per-action files cost little:

```ts
export const useDeleteMember = (): DeleteMember => {
  const [deleteMember] = useDeleteMemberMutation();

  return useCallback(
    (userId) => runAccessMutation('deleteMember', deleteMember(userId)),
    [deleteMember],
  );
};
```

Keep form components depending on an abstraction, not on the transport. A form owns field
registration, client validation, and submission state, then reports validated values through
`onSave`; its owner performs the request, maps server field errors, and closes the dialog. This is
the ownership rule in [Frontend architecture](../frontend-architecture.md) and it is what lets a form
be tested without a store or a stubbed network.

## 6. Keep branching flat

Long `if` chains and stacked ternaries are where cognitive load accumulates fastest. Four techniques
cover nearly every case.

**Return early for mutually exclusive whole-component states.** Put the exits at the top so the
happy path is unindented and reads last:

```tsx
if (!canReadMembers || !members.isReady) {
  return <MembersDatasetCard dataset={members} />;
}

return <section>{/* the real thing */}</section>;
```

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
the items first and let the JSX stay a single `map`. Use Lodash `compact` to drop the ones the actor
may not have:

```tsx
const actions = compact<RowAction>([
  canEditEmail && {
    id: 'editEmail',
    label: t('members.menu.editEmail'),
    run: () => onEditEmail(member),
  },
  canDeleteMember && {
    id: 'deleteMember',
    label: t('members.menu.deleteMember'),
    run: () => onDeleteMember(member),
  },
]);
```

**Never branch between elements with a ternary.** A ladder of `a ? x : b ? y : c ? z : w` is a set
of early returns wearing a disguise — extract it into a small component or helper that returns early
instead. A single `condition ? <Thing /> : null` is a `Conditional`:
[Writing web conditional components](writing-web-conditional-components.md) states that rule in
full, including what to do when the branch's props only exist under the condition. A ternary that
picks a _value_ — `className={isSelected ? 'a' : 'b'}`, `{isSubmitting ? t('saving') : t('save')}` —
is not a branch between elements and stays as it is.

Prefer rendering nothing over accepting a visibility flag. A component that gates itself
(`if (!canCreateRoles) return null`) removes a branch from its parent and keeps the rule next to the
control it protects.

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

## 8. Own transient UI state where it is triggered

Keep dialog, selection, and search state in the component that opens or owns the control, and no
higher. A search term nothing outside a list reads belongs inside that list, not in its parent's
props.

Do not build a module-wide "which workflow is open" union routed through a central switch. That
turns every unrelated workflow into a shared type, a shared reducer, and a shared render site. Where
several dialogs genuinely share one trigger surface — the rows of a list — keep the state local and
narrow:

```tsx
type MemberDialog = {
  kind: 'deleteMember' | 'editEmail' | 'resetPassword';
  member: AccessMember;
};
```

Render the open one inline with flat guards, one per line. Because a dialog is mounted only while
open, it seeds itself from the member it was opened for and needs no reset effect.

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
- no data or capability read that could be read one level lower;
- each dependency is the narrowest one that does the job;
- no ternary choosing between elements, and no `if` chain that is really a lookup;
- every branch gated by `Conditional`, or resolved to a named element above the return;
- every event handler declared and named above the return, and the JSX passes the reference;
- transient UI state lives with the control that owns it;
- tests colocated with the component, querying by role, label, and name.

Then run the checks from [Frontend architecture](../frontend-architecture.md):

```sh
pnpm --filter @warehouser/web lint
pnpm --filter @warehouser/web test
pnpm --filter @warehouser/web build
```
