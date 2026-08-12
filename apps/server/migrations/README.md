# Database migrations

Production schema changes are timestamped TypeORM migration classes in this directory. Generate,
review, apply, and revert them through the server package scripts. Never enable TypeORM runtime
schema synchronization.

Every pending migration runs inside one transaction, so a failure part-way through a run rolls back
the migrations that already reported success in the same invocation. Check the `migrations` table
before reverting after a failed run — the last recorded migration is not necessarily the one whose
name the run last printed.

## Extending a Permission catalogue

Both catalogues — `permissions` for the Warehouse level and `workspace_permissions` for the
Workspace level — are seeded by the migration that creates them and extended by later migrations.
A catalogue row is a fixed identifier, a label, and a `kind` of `assignable` or `reserved`. A
`reserved` entry stays exclusive to the protected Role of its level and is refused for custom Roles
by a check constraint, so a new entry is `reserved` only when it must never be delegated.

Extending a catalogue is two steps, and both must be safe to apply to a database that already holds
production data:

1. **Insert the new catalogue rows.** A plain insert is enough for identifiers the release
   introduces, because the primary key makes a repeated apply fail loudly rather than silently
   duplicate.
2. **Grant them to every existing protected Role with an idempotent `INSERT ... SELECT`.** A new
   Permission that the protected Role is meant to hold does not reach the Roles that already exist
   — provisioning only grants the set known when the Role was created. Select across the existing
   protected Roles and guard the insert with `NOT EXISTS` so re-applying it is a no-op, and so a
   Permission some Roles already hold can be reasserted in the same statement.

At the Warehouse level the protected Role is `roles.kind = 'warehouse_manager'`; see
`1786025100000-GrantUsersManagementPermissions.ts`. At the Workspace level it is
`workspace_roles.kind = 'workspace_owner'`, and the grant writes the composite
`(workspace_role_id, workspace_permission_id, workspace_role_kind, workspace_permission_kind)`
that `workspace_role_permissions` requires:

```sql
INSERT INTO workspace_role_permissions (
  workspace_role_id, workspace_permission_id, workspace_role_kind, workspace_permission_kind
)
SELECT r.id, p.id, r.kind, p.kind
FROM workspace_roles r
CROSS JOIN workspace_permissions p
WHERE r.kind = 'workspace_owner'
  AND p.id = ANY($1)
  AND NOT EXISTS (
    SELECT 1
    FROM workspace_role_permissions rp
    WHERE rp.workspace_role_id = r.id AND rp.workspace_permission_id = p.id
  )
```

The matching `down` removes the grants before the catalogue rows, because
`workspace_role_permissions` references `workspace_permissions` with `ON DELETE RESTRICT`.
