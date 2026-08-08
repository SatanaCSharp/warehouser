# Placing Web Components

Use this guide whenever a `modules/<module>/components/` directory (or any directory nested inside
one) grows a second component. Read [Frontend architecture](../frontend-architecture.md) first.

## The nesting rule

A component owns another component when the other component is rendered only by it — no sibling,
no other module reaches in and imports it directly. When that happens, nest the owned components one
level down, inside a `components/` directory named after the owner:

```text
modules/<module>/components/
└── <Owner>.tsx              # e.g. AccessAdministration.tsx
    components/
    └── <Owned>.tsx           # rendered only by <Owner>.tsx
```

In file terms, `modules/access/components/access-administration/AccessAdministration.tsx` owns
`MemberList.tsx`, so `MemberList.tsx` lives at
`modules/access/components/access-administration/components/members/MemberList.tsx`, not as a
sibling of `AccessAdministration.tsx`.

Apply the rule recursively. If a nested component itself becomes the exclusive owner of further
child components, repeat the same pattern one level deeper: a `components/` directory named after
that component, sitting beside it.

Colocate a component's test with the component after the move — `MemberList.spec.tsx` moves with
`MemberList.tsx`.

### When not to nest

Do not nest a component that has more than one consumer. If two owners in the same module need it,
or another module needs it, keep it at the shared ancestor level instead — the module's
`components/` root, or `shared/components/` once a second module needs it (see
[Frontend architecture](../frontend-architecture.md#source-structure)). Nesting encodes exclusive
ownership; once ownership is no longer exclusive, the file must move back out to where every
consumer can reach it without reaching into another component's private tree.

## Grouping owned components by domain

An owner's `components/` directory can still get hard to scan once it collects components serving
more than one distinct action or domain the owner coordinates. When that happens, group the owned
components into subdirectories named for the domain/entity they act on, not for their UI shape (do
not create `dialogs/`, `lists/`, `forms/` buckets — those group by what a component looks like, not
by what a contributor is trying to change).

Worked example — `AccessAdministration.tsx` coordinates two distinct actions, member administration
and role administration, so its owned components split into `members/` and `roles/`:

```text
modules/access/components/access-administration/
├── AccessAdministration.tsx
├── AccessAdministration.spec.tsx
└── components/
    ├── members/
    │   ├── CreateMemberDialog.tsx
    │   ├── CreateMemberDialog.spec.tsx
    │   ├── DeleteMemberDialog.tsx
    │   ├── EditEmailDialog.tsx
    │   ├── EditEmailDialog.spec.tsx
    │   ├── MemberList.tsx
    │   ├── MemberList.spec.tsx
    │   ├── MemberRoleActions.tsx
    │   ├── ResetPasswordDialog.tsx
    │   └── ResetPasswordDialog.spec.tsx
    └── roles/
        ├── AssignmentDialog.tsx
        ├── DeletionDialog.tsx
        ├── RoleDialog.tsx
        ├── RoleEditor.tsx
        ├── RoleList.tsx
        └── TransferDialog.tsx
```

Skip the subgrouping when the owner's components all serve one domain, or when there are few enough
to read at a glance (roughly under half a dozen) — an extra directory level for two or three files
adds navigation cost instead of removing it.

A helper the owner's whole subtree shares (a hook, a schema) does not follow this rule: it is not a
component, so it stays in the module-level `hooks/` or `schemas/` directory per
[Frontend architecture](../frontend-architecture.md), even when every current caller happens to live
under one owner's `components/` tree.
