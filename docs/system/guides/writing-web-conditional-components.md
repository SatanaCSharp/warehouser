# Writing Web Conditional Components

This guide applies to `apps/web`. It defines how a condition that decides **which element renders**
is expressed inside JSX. A ternary that picks a value rather than an element —
`className={isSelected ? 'a' : 'b'}`, `type={isVisible ? 'text' : 'password'}`,
`{isSubmitting ? t('saving') : t('save')}` — is outside its scope and stays as it is.

[Writing web components](writing-web-components.md) §6 states the general rule — keep branching
flat. This guide is the specific one it defers to for the commonest branch of all: _render this, or
render nothing_.

## 1. Gate with `Conditional`, never with an inline ternary

`shared/components/Conditional.tsx` is the only way `apps/web` writes a conditional branch in JSX.

```tsx
// Avoid — the gate is punctuation, and the `: null` arm is noise a reader
// still has to parse before concluding that nothing renders.
{
  isArchived ? (
    <Chip color="default" size="sm" variant="soft">
      {t('warehouses.chips.archived')}
    </Chip>
  ) : null;
}

// Prefer — the gate is a named attribute, and the closed case is not written.
<Conditional when={isArchived}>
  <Chip color="default" size="sm" variant="soft">
    {t('warehouses.chips.archived')}
  </Chip>
</Conditional>;
```

`when` takes any value, not only a boolean: a count, an optional value, or a comparison may be
passed as it stands. When the closed case has to render something, name it:

```tsx
<Conditional when={hasMembers} otherwise={<EmptyState />}>
  <MemberList members={members} />
</Conditional>
```

Do not reach for `&&` instead. `{count && <Badge />}` renders the literal `0` when the count is
zero, and `{value && <Row />}` reads as an expression rather than as a branch.

## 2. Both arms are evaluated — resolve a dependent branch before the return

`Conditional` chooses which element to return. It does not defer building the other one, because
both are ordinary children and JSX evaluates children eagerly. A branch whose props only exist
under the condition therefore **cannot** be written as one:

```tsx
// Broken — `selectedWarehouse` is read whether or not one is selected.
<Conditional when={selectedWarehouse}>
  <WarehouseDetailPane warehouse={selectedWarehouse} />
</Conditional>
```

Resolve it to a single element before the return instead, and render that element:

```tsx
// The pane reads the Warehouse it was opened for, so it is resolved here
// rather than gated inline.
const detailPane = !selectedWarehouse ? null : (
  <WarehouseDetailPane warehouse={selectedWarehouse} />
);

return (
  <div>
    <WarehouseList warehouses={warehouses} onSelect={onSelectWarehouse} />
    {detailPane}
  </div>
);
```

This is the same rule [Writing web components](writing-web-components.md) §6 already states for
values: compute the branch first, and let the JSX stay flat. The name you give the element
(`detailPane`, `roleEditor`, `openDialog`) is what the reader sees at the render site.

Note what this is not: it is not a licence to keep the old ternary in the JSX. The ternary moves out
of the tree and becomes one named declaration beside the handlers.

## 3. Several mutually exclusive branches are a lookup, not a chain

When one piece of state decides _which_ of several elements renders, resolve them with a lookup
keyed by that state rather than stacking guards:

```tsx
const openDialog =
  dialog === null
    ? null
    : {
        editEmail: (
          <EditEmailDialog member={dialog.member} onClose={onCloseDialog} />
        ),
        resetPassword: (
          <ResetPasswordDialog member={dialog.member} onClose={onCloseDialog} />
        ),
        deleteMember: (
          <DeleteMemberDialog member={dialog.member} onClose={onCloseDialog} />
        ),
      }[dialog.kind];
```

Building three elements to render one is cheap — element creation runs no hooks and has no effects.
Reading three stacked `Conditional`s that each re-test the same `dialog.kind` is not.

## 4. A component that gates itself needs no `Conditional` at all

Prefer rendering nothing over accepting a visibility flag. A component that answers the question
itself removes the branch from its parent and keeps the rule beside the control it protects:

```tsx
export const CreateRoleAction = (): ReactElement | null => {
  const { canCreateRoles } = useAccessCapabilities();

  if (!canCreateRoles) {
    return null;
  }

  return; /* … */
};
```

Its parent renders `<CreateRoleAction />` and passes nothing. Use `Conditional` for a branch inside
one component's own tree; use a self-gating component for a whole workflow.

Whole-component states that are mutually exclusive — loading, empty, error, ready — are early
returns for the same reason. Put the exits at the top so the happy path is unindented and reads
last.

## 5. Verify before completing

- no `{condition ? <Thing /> : null}` (or its inverted `{condition ? null : <Thing />}`) and no
  `{condition && <Thing />}` anywhere in the tree;
- every branch whose props depend on the condition is resolved to a named element before the return;
- no stack of `Conditional`s testing the same value — that is a lookup;
- a workflow that may not be offered at all gates itself and returns `null`.
