# Gate Web Controls Declaratively, Never With Capability Booleans

Status: Accepted

Date: 2026-08-19

## Context

`apps/web` authorizes what it offers at two levels, from two vocabularies that never meet (AC-31):
Warehouse-level `PermissionId`, read from the addressed Warehouse's `access/current` projection, and
Workspace-level `WorkspacePermissionId`, read from the Workspace context. Two gate components have
existed for that since the levels were separated — `shared/components/WarehousePermissionGate` and
`shared/components/WorkspacePermissionGate` — and the sidebar used them.

Everything else had grown a second, parallel mechanism: a boolean per capability. A projection hook
(`useAccessCapabilities`) turned a Permission table into `canCreateRoles`, `canReadMembers`,
`canManageRoles`, `canTransferManager` and nine more; components tested those booleans in `if (!canX)
return null` guards and in `Conditional when={canX && …}`; and several travelled as props —
`canDeleteMember`, `canEditEmail` and `canResetPassword` from `MemberDirectory` through `MemberList`
into `MemberRow`, `canArchiveWarehouse`, `canCreateWarehouse` and `canRenameWarehouse` from
`WarehousesTab` through `WarehouseDetailPane` into three leaves.

That arrangement had four costs, all of them observed in this tree rather than hypothesized:

- **Authorization moved with the props, so it could be faked.** Every drilled boolean is a hole in
  the test surface: a spec mounting `MemberList` with `canDeleteMember: true` asserted a menu the
  actor's real Permissions never had to grant, and the review of the previous refactor
  (`docs/change-requests/refactor-warehouse-components/_review/review-2026-08-18.md`, findings S3–S5)
  recorded exactly this — a gate moved behind harness props and left "asserted by nothing that could
  fail".
- **The rules composed by boolean algebra rather than by Permission sets.** `canManageRoles` was an
  or of five other booleans, and `canDelete={canDeleteRoles && !isArchived}` fused an authorization
  rule with a record-state rule into one prop whose name mentioned neither.
- **Prop drilling exceeded the two-hop budget** that
  [Writing web components](../guides/writing-web-components.md) §4 sets, and forced components that
  render no control of their own (`MemberList`, `WarehouseDetailPane`) to carry authority in their
  prop types.
- **The count of conditionals grew with the count of controls**, because each capability was tested
  wherever it was consumed, in a form (`&&`, early return, ternary) chosen per site.

## Decision

**One question, one place, one form.** Every decision about what the acting user may be _offered_ is
expressed by a gate component at the control it protects. No component receives a capability as a
prop, and no capability boolean is derived to be tested in markup.

**1. Element gates.** A control, panel, form or workflow that may be withheld wraps itself in the
gate for its level and names the Permissions it requires:

```tsx
<WarehousePermissionGate permission={PermissionId.ROLES_CREATE}>…</WarehousePermissionGate>
<WorkspacePermissionGate permission={WorkspacePermissionId.WAREHOUSES_RENAME}>…</WorkspacePermissionGate>
```

**The two gates have one interface**, deliberately identical apart from the vocabulary each accepts:
`children`, and a required `permission` naming one Permission or an array of which **any one** admits
the control. Nothing else — no `fallback`, no `match`, no way to pass a Permission list in from
outside. A gate renders its children or nothing, so a reader who knows one gate knows both, and no
call site can reach for a behavior the other level lacks.

A component that gates itself returns the gate rather than `ReactElement | null`, so its parent
renders `<CreateRoleAction />` and passes nothing.

**2. Collection gates.** A React Aria collection — `Tabs.List`, `Dropdown.Menu` — reads its own
children, so no element may sit between it and its items. Those surfaces build a descriptor list in
which **each object carries the same `permission` field a gate would take**, and pass the list
through the collection form of the same gate:

```tsx
const actions = usePermittedItems<RowAction>([
  { id: 'editEmail', permission: PermissionId.USERS_EMAIL_UPDATE, … },
  { id: 'deleteMember', permission: PermissionId.USERS_DELETE, … },
]);
```

`shared/hooks/projections/usePermittedItems` and `useWorkspacePermittedItems` keep the descriptors
whose Permissions the actor holds. Four surfaces use this form: the access workspace's tab bar, the
Workspace administration tab bar, and the two member rows' action menus. Each reads its projection once, so a menu of eight actions costs
one read, and adding an action is one object with one field — never another boolean, another `&&`,
and another test site.

**3. Where a boolean is still legitimate — and where it must be read.** A gate decides _whether an
element renders_. When the answer instead feeds a value, the Permission is read with
`useHasPermission` / `useHasWorkspacePermission` **at the component that uses it**:

- a query's `skip`, so a dataset the actor may not read is never requested (`useAccessMembers`,
  `WarehousesTab`'s people read);
- an `isDisabled`, `disabledKeys` or `aria-describedby` on a control that is deliberately shown and
  refused with a reason (`RoleEditor`'s fieldset, `WarehouseSwitcher`'s Workspace row);
- the choice between **two whole surfaces**, where the actor who may not administer gets a read-only
  one rather than nothing (`RolesTab`, `MembersTab`, and the access page's refusal). A gate renders
  its children or nothing; picking between two surfaces is an early return, and it reads as one
  because the alternative is named on the line that returns it.

Such a boolean never crosses a component boundary. `canX` as a **prop** is what this decision
removes; `canX` as a local read whose consumer is in the same file is what it keeps.

**4. Rules stay separated, one per gate.** Authorization, record state and identity are different
questions and are never fused into one condition. A delete control an actor may run, on a Role that
is protected, in a Warehouse that is archived, is a gate around a `Conditional`:

```tsx
<WarehousePermissionGate permission={PermissionId.ROLES_DELETE}>
  <Conditional when={!isProtected && !isArchived}>…</Conditional>
</WarehousePermissionGate>
```

Each gate then reads as the one rule it enforces, and neither re-tests the other.

**5. There is no capability vocabulary between the enum and the call site.** A gate, a descriptor and
a dataset read all name `PermissionId` / `WorkspacePermissionId` members directly. Where a surface
needs several — the Roles tab, the two dataset reads — the list is a `const` in that surface's own
file, named for what it admits (`roleAdministrationPermissions`, `membersReadPermissions`) and
exported to nobody. There is no shared capability table to consult, so the Permissions a control
requires are readable in the file that renders it, and the two levels are described the same way.

**6. `useAccessCapabilities` is removed.** What remains of it — which Warehouse the surface addresses
and whether that Warehouse is archived — is `useAccessScope`, a projection that answers no
authorization question at all.

## Alternatives

- **Keep the capability-boolean hook and use it everywhere consistently.** Rejected: consistency
  would not close the test hole, because the value is still passable as a prop, and it leaves
  authorization expressed in a form (`&&` in markup) the conditional-component guide already
  forbids for elements.
- **Keep the hook for reads and gates for markup.** Rejected as the steady state: two mechanisms for
  one question is what this decision exists to end. The table plus `useHasPermission` gives dataset
  gating the same vocabulary the components use, from the same file.
- **Wrap collection items in a gate element
  (`<WarehousePermissionGate><Dropdown.Item /></WarehousePermissionGate>`).**
  Rejected: React Aria collections resolve their children structurally, so an interposed component
  is not a supported child of `Tabs.List` or `Dropdown.Menu`. The descriptor form is the honest
  expression of the same rule.
- **Let each control call `useHasPermission` and early-return `null`.** Rejected: it is one hook plus
  one branch per control where the gate is a single element, and it re-establishes the habit of
  writing authorization as control flow, which is what made the branch count grow with the control
  count.
- **Keep a capability table (`accessGrants`) as the Warehouse level's vocabulary.** Tried, then
  rejected: it removed the duplication described in § Consequences, but it put a second name on every
  rule (`accessGrants.manageRoles` for five Permission ids) that a reader had to resolve before they
  could tell what the server would enforce, and it described the two authorization levels
  differently — a table on one side, enum members on the other. Naming Permissions directly is the
  smaller vocabulary.
- **Give the Warehouse gate more than the Workspace gate has — a `fallback`, a `match: 'all'`, an
  injectable `permissionIds`.** Rejected: all three existed and only `fallback` had a caller. Two
  gates with two shapes invite a call site to reach for whichever behavior happens to be on its side
  of the boundary, and `match: 'all'` in particular expresses an authorization rule the server does
  not have. The pair now has one shape, and the two surfaces that needed `fallback` read the
  Permission and return one of two surfaces instead.
- **Enforce the rule with a lint rule banning `can`-prefixed props.** Rejected here as a separate
  concern. The prop types are the mechanism: a leaf that declares no capability prop cannot be handed
  one, and review reads the gate beside the control.

## Consequences

- **Every gate now exercises the real projection.** A spec that varies authority varies the stubbed
  projection or Workspace context. `MemberList.spec` seeds the cached projection for the actor under
  test instead of passing three booleans, so its "hides only the actions the actor is not
  permissioned for" case asserts the production gate.
- **Leaves lost authority from their prop types.** `MemberList`, `MemberRow`, `WarehouseDetailPane`,
  `WarehouseNameForm`, `WarehouseLifecycleActions`, `AddWarehouseAction`, `RoleEditor` and
  `WorkspaceRoleEditor` no longer name a capability in their props, and the two-hop budget is met
  without an intermediate carrying values it does not use.
- **A child's gate reads the same cached query its parent already subscribed to**, so self-gating
  costs no extra request. It does change _ordering_: a child's effect runs before its parent's, so
  the context read a gate performs can now precede the parent's own list read. One case in
  `WarehousesTab.spec` asserted "no create request" by request _position_ and now asserts it by
  _count_ — the same subject and expected outcome, no longer sensitive to an order nothing requires.
- **Both arms of a `Conditional` are still built.** A `Conditional` with an `otherwise` creates both
  elements and renders one; element creation runs no hooks, which is why
  `WarehouseLifecycleActions` can name its archive controls in the closed arm.
- **The gates are interchangeable in shape, so neither grows features the other lacks.** They are
  also named as a pair — `WarehousePermissionGate` and `WorkspacePermissionGate` — so which
  vocabulary a call site is in is legible from the tag, and neither name suggests a gate on anything
  but a Permission. The cost of the shared shape is that a surface needing an alternative branch
  cannot express it in the gate: `RolesTab`, `MembersTab` and the access page each read the
  Permission and return one of two surfaces (§ Decision 3).
- **A capability that spans several surfaces is named in each of them.** "Any Role administration at
  all" appears twice — the tab bar admits Role readers too, and `RolesTab` admits administrators — as
  do the dataset reads that must fire for anyone whose surface names a Role. Widening such a
  capability is therefore an edit per site, and two sites can drift. That is the accepted price of
  having no capability layer: the Permissions a surface requires are legible where it is written, and
  a reader never has to resolve a `canDoThing` name against a table to know what the server will
  enforce. Where the list is long enough to matter it is a named `const` at the top of the file, so
  the drift is visible in review rather than buried in a call.
- **The escape hatch is a real risk.** `useHasPermission` still exists and still returns a boolean, so
  a contributor can reintroduce a drilled `canX` one prop at a time. What stops it is the rule stated
  in § Decision 3 — the read lives with its consumer — and review; nothing mechanical enforces it.
- **Documentation that taught the old mechanism has been rewritten**:
  [Writing web components](../guides/writing-web-components.md) §3, §4 and §6,
  [Writing web conditional components](../guides/writing-web-conditional-components.md) §4, the
  `projections/` row of [Placing web hooks](../guides/placing-web-hooks.md), and the prop-drilling
  table in [Sharing web state with context](../guides/sharing-web-state-with-context.md) §1 no longer
  show a capability boolean as the way to gate a control.
- **This decision governs authorization only.** Membership (`WarehouseRow`'s `canEnter`), record
  state (`isArchived`, `isProtected`) and identity (`isSelf`) are not Permissions and keep their
  `Conditional` gates, deliberately unmerged with the Permission gates beside them.

## Links

- [Writing web components](../guides/writing-web-components.md)
- [Writing web conditional components](../guides/writing-web-conditional-components.md)
- [Placing web hooks](../guides/placing-web-hooks.md)
- [Frontend architecture](../frontend-architecture.md)
- [RTK Query for web API calls](./02-08-2026-rtk-query-for-web-api-calls.md) — why a child's gate
  reads a cache rather than issuing a request
