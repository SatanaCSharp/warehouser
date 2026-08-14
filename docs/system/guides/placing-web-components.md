# Placing Web Components

Use this guide whenever a `modules/<module>/components/` directory (or any directory nested inside
one) grows a second component. Read [Frontend architecture](../frontend-architecture.md) first.

This guide decides where a component's file goes.
[Writing web components](writing-web-components.md) decides what goes inside it.

## The nesting rule

A component owns another component when the other component is rendered only by it — no sibling,
no other module reaches in and imports it directly. When that happens, nest the owned components one
level down, inside a `components/` directory named after the owner:

```text
modules/<module>/components/
└── <Owner>.tsx              # e.g. AccessWorkspace.tsx
    components/
    └── <Owned>.tsx           # rendered only by <Owner>.tsx
```

In file terms, `modules/access/components/access-workspace/AccessWorkspace.tsx` owns
`MemberList.tsx`, so `MemberList.tsx` lives at
`modules/access/components/access-workspace/components/members/MemberList.tsx`, not as a
sibling of `AccessWorkspace.tsx`.

Apply the rule recursively. If a nested component itself becomes the exclusive owner of further
child components, repeat the same pattern one level deeper: a `components/` directory named after
that component, sitting beside it.

Colocate a component's test with the component after the move — `MemberList.spec.tsx` moves with
`MemberList.tsx`.

### When not to nest

What this rule protects against is a consumer reaching into another component's **private tree**.
Nesting encodes exclusive ownership; once ownership is no longer exclusive, the file must move back
out to where every consumer can reach it without reaching past an owner.

So do not nest a sub-page component that has more than one consumer. If two owners in the same
module need it, keep it at the shared ancestor level instead — the module's `components/` root, or
`shared/components/` once a second module needs it (see
[Frontend architecture](../frontend-architecture.md#source-structure)). Sub-page components follow
this rule unchanged.

A module's **declared public surface** is exempt. A route owner composing another module's
page-level view — `modules/workspace`'s administration shell rendering the warehouses tab owned by
`modules/warehouse` — is importing declared surface, not reaching into a private tree. That import
does not make the view shared and does not promote it to `shared/components/`: the view stays in the
module of the entity whose invariants it enforces, per
[Domain-owned flat modules](../adr/14-08-2026-domain-owned-flat-modules.md). Reaching into a
component another module has _not_ declared is still a violation, and is exactly what this rule
forbids.

## Grouping owned components by domain

An owner's `components/` directory can still get hard to scan once it collects components serving
more than one distinct action or domain the owner coordinates. When that happens, group the owned
components into subdirectories named for the domain/entity they act on, not for their UI shape (do
not create `dialogs/`, `lists/`, `forms/` buckets — those group by what a component looks like, not
by what a contributor is trying to change).

Worked example — `AccessWorkspace.tsx` coordinates three distinct domains, so its owned components
split into `members/`, `roles/`, and `permissions/`. `CreateActionButton.tsx` serves two of them, so
it stays at the shared `components/` root rather than inside either domain:

```text
modules/access/components/access-workspace/
├── AccessWorkspace.tsx
├── AccessWorkspace.spec.tsx
└── components/
    ├── CreateActionButton.tsx
    ├── members/
    │   ├── CreateMemberAction.tsx
    │   ├── CreateMemberDialog.tsx
    │   ├── DeleteMemberDialog.tsx
    │   ├── EditEmailDialog.tsx
    │   ├── MemberDirectory.tsx
    │   ├── MemberList.tsx
    │   ├── MemberRow.tsx
    │   ├── MembersDatasetCard.tsx
    │   ├── MembersTab.tsx
    │   └── ResetPasswordDialog.tsx
    ├── permissions/
    │   └── PermissionsTab.tsx
    └── roles/
        ├── AssignRoleDialog.tsx
        ├── CreateRoleAction.tsx
        ├── CreateRoleDialog.tsx
        ├── DeleteRoleDialog.tsx
        ├── MemberAssignmentList.tsx
        ├── PermissionCheckbox.tsx
        ├── RoleDirectory.tsx
        ├── RoleEditor.tsx
        ├── RoleList.tsx
        ├── RolesDatasetCard.tsx
        ├── RolesTab.tsx
        ├── TransferManagerAction.tsx
        └── TransferManagerDialog.tsx
```

(Each component's colocated `.spec.tsx` is omitted above for brevity; it sits beside its owner.)

Skip the subgrouping when the owner's components all serve one domain, or when there are few enough
to read at a glance (roughly under half a dozen) — an extra directory level for two or three files
adds navigation cost instead of removing it.

A helper the owner's whole subtree shares (a hook, a schema) does not follow this rule: it is not a
component, so it stays in the module-level `hooks/` or `schemas/` directory per
[Frontend architecture](../frontend-architecture.md), even when every current caller happens to live
under one owner's `components/` tree.
