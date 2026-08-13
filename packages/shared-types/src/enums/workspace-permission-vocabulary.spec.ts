// AC-18, AC-31 (docs/features/workspaces/spec.md §5).
//
// ADR 0001 (docs/features/workspaces/adr/0001-two-level-request-authorization.md) requires
// `WorkspacePermissionId` and `PermissionId` to be structurally distinct vocabularies, not a
// union member or a widened string alias, so that declaring the wrong level's Permission on a
// handler fails to *compile* rather than only failing a runtime test (level confusion, AC-31).
//
// The sixteen identifiers below are copied verbatim from the seed rows of migration
// `apps/server/migrations/1786524800000-CreateWorkspaceAuthoritySchema.ts`
// (`initialWorkspacePermissions`), which is the source of truth this test's catalogue list must
// match exactly. `WORKSPACE_OWNER_ROLE:REASSIGN` is the sole `reserved` row there; every other
// row is `assignable`.
import { ErrorCode } from 'enums/error-code';
import type { PermissionId } from 'enums/permission-id';
import { PermissionId as PermissionIdConst } from 'enums/permission-id';
import type { WorkspacePermissionId } from 'enums/workspace-permission-id';
import { WorkspacePermissionId as WorkspacePermissionIdConst } from 'enums/workspace-permission-id';

// The exact sixteen catalogue identifiers seeded by migration `01` (workspace authority schema),
// in the same order they appear there. `WORKSPACE_OWNER_ROLE:REASSIGN` is the reserved entry.
const MIGRATION_WORKSPACE_PERMISSION_CATALOGUE = [
  'WORKSPACE:RENAME',
  'WORKSPACE_ROLES:WATCH',
  'WORKSPACE_ROLES:CREATE',
  'WORKSPACE_ROLES:UPDATE',
  'WORKSPACE_ROLES:DELETE',
  'WORKSPACE_ROLES:ASSIGN',
  'WORKSPACE_MEMBERS:WATCH',
  'WORKSPACE_MEMBERS:ADD',
  'WORKSPACE_MEMBERS:REMOVE',
  'WAREHOUSES:WATCH',
  'WAREHOUSES:CREATE',
  'WAREHOUSES:RENAME',
  'WAREHOUSES:ARCHIVE',
  'WAREHOUSE_MEMBERSHIPS:ASSIGN',
  'WAREHOUSE_MEMBERSHIPS:REVOKE',
  'WORKSPACE_OWNER_ROLE:REASSIGN',
] as const;

const RESERVED_WORKSPACE_PERMISSION_ID: (typeof MIGRATION_WORKSPACE_PERMISSION_CATALOGUE)[number] =
  'WORKSPACE_OWNER_ROLE:REASSIGN';

// api-sync-report.md §2 — the 22 new stable error codes this feature must add to `ErrorCode`,
// alongside the codes already there.
const NEW_STABLE_ERROR_CODES = [
  'workspace.denied',
  'workspace.invalid_input',
  'workspace.target_unavailable',
  'workspace.role_name_conflict',
  'workspace.protected_role',
  'workspace.system_managed_permission',
  'workspace.owner_transfer_required',
  'workspace.role_assignment_required',
  'workspace.replacement_role_required',
  'workspace.member_exists',
  'workspace.warehouse_membership_required',
  'workspace.self_action_denied',
  'workspace.manager_transfer_required',
  'workspace.membership_exists',
  'workspace.warehouse_archived',
  'workspace.last_unarchived_warehouse',
  'workspace.concurrent_change',
  'access.warehouse_archived',
  'workspace.warehouse_creation_unavailable',
  'workspace.archival_unavailable',
  'workspace.role_deletion_unavailable',
  'workspace.owner_transfer_unavailable',
] as const;

describe('WorkspacePermissionId catalogue (AC-18)', () => {
  it('matches the sixteen identifiers seeded by migration 01 exactly', () => {
    const declaredIds = Object.values(WorkspacePermissionIdConst)
      .slice()
      .sort();
    const catalogueIds = [...MIGRATION_WORKSPACE_PERMISSION_CATALOGUE].sort();

    expect(declaredIds).toEqual(catalogueIds);
  });

  it('includes WORKSPACE_OWNER_ROLE:REASSIGN, the migration-reserved identifier', () => {
    expect(Object.values(WorkspacePermissionIdConst)).toContain(
      RESERVED_WORKSPACE_PERMISSION_ID,
    );
  });

  it('declares no label as a type or constant, only bare identifiers', () => {
    // AC-18: Workspace Permission definitions (identifier + label + kind) are system-managed
    // catalogue data seeded by the migration, not TypeScript vocabulary. Every declared value
    // must be a bare `MODULE:ACTION` identifier, never a human-readable label.
    for (const id of Object.values(WorkspacePermissionIdConst)) {
      expect(id).toMatch(/^[A-Z][A-Z0-9_]*:[A-Z][A-Z0-9_]*$/u);
    }
  });
});

describe('WorkspacePermissionId / PermissionId structural distinctness (AC-31)', () => {
  it('is not assignable to PermissionId in either direction (compile-time)', () => {
    const workspacePermission: WorkspacePermissionId = 'WORKSPACE:RENAME';
    const warehousePermission: PermissionId = PermissionIdConst.USERS_CREATE;

    // @ts-expect-error a WorkspacePermissionId must never satisfy PermissionId — level confusion
    // (AC-31) must be a compile error, not a runtime authorization hole.
    const asPermission: PermissionId = workspacePermission;
    // @ts-expect-error a PermissionId must never satisfy WorkspacePermissionId, the reverse
    // direction of the same compile-time guarantee.
    const asWorkspacePermission: WorkspacePermissionId = warehousePermission;

    // Reached only if the assignments above compiled, which they must not.
    expect(typeof asPermission).toBe('string');
    expect(typeof asWorkspacePermission).toBe('string');
  });
});

describe('ErrorCode — new stable codes (AC-18, AC-31 boundary errors)', () => {
  it('defines every code api-sync-report.md §2 lists as new', () => {
    const declaredValues = Object.values(ErrorCode);

    for (const code of NEW_STABLE_ERROR_CODES) {
      expect(declaredValues).toContain(code);
    }
  });

  it('has no duplicate values across the whole registry', () => {
    const declaredValues = Object.values(ErrorCode);

    expect(new Set(declaredValues).size).toBe(declaredValues.length);
  });
});
