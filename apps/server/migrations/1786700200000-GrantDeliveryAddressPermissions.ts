import type { MigrationInterface, QueryRunner } from 'typeorm';

// `spec.md` §6.1 fixes the five Permissions this feature introduces: four at the Warehouse level,
// because their subject is a resource the Warehouse owns, and one at the Workspace level, because
// its subject is the Warehouse record itself — which `workspaces` already classifies as a Workspace
// Capability beside renaming and archiving (`sad.md` §4, `spec.md` §8 fourth question at its stated
// default).
//
// Every one of them is `assignable`: none is reserved to a protected Role, because a Workspace Owner
// must be able to delegate each capability to a custom Role.
export const newWarehousePermissions = [
  [
    'CUSTOMERS:WATCH',
    'View customers and their delivery addresses',
    'assignable',
  ],
  ['CUSTOMERS:CREATE', 'Record customers', 'assignable'],
  [
    'CUSTOMERS:UPDATE',
    'Update customers and their delivery addresses',
    'assignable',
  ],
  ['CUSTOMERS:DEACTIVATE', 'Deactivate and reactivate customers', 'assignable'],
] as const;

export const newWorkspacePermissions = [
  [
    'WAREHOUSES:ADDRESS_UPDATE',
    'Record warehouse delivery addresses',
    'assignable',
  ],
] as const;

const grantedWarehousePermissionIds = newWarehousePermissions.map(([id]) => id);
const grantedWorkspacePermissionIds = newWorkspacePermissions.map(([id]) => id);

export class GrantDeliveryAddressPermissions1786700200000 implements MigrationInterface {
  // Follows `apps/server/migrations/README.md` § Extending a Permission catalogue at both levels:
  // insert the catalogue rows, then grant them to every protected Role that already exists, because
  // provisioning only granted the set known when each Role was created.

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.manager.insert(
      'permissions',
      newWarehousePermissions.map(([id, label, kind]) => ({ id, label, kind })),
    );

    await queryRunner.query(
      `
      INSERT INTO role_permissions (role_id, permission_id, role_kind, permission_kind)
      SELECT r.id, p.id, r.kind, p.kind
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.kind = 'warehouse_manager'
        AND p.id = ANY($1)
        AND NOT EXISTS (
          SELECT 1
          FROM role_permissions rp
          WHERE rp.role_id = r.id AND rp.permission_id = p.id
        )
      `,
      [grantedWarehousePermissionIds],
    );

    await queryRunner.manager.insert(
      'workspace_permissions',
      newWorkspacePermissions.map(([id, label, kind]) => ({ id, label, kind })),
    );

    // The Workspace grant writes the composite
    // `(workspace_role_id, workspace_permission_id, workspace_role_kind, workspace_permission_kind)`
    // that `workspace_role_permissions` requires.
    await queryRunner.query(
      `
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
      `,
      [grantedWorkspacePermissionIds],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Grants go before the catalogue rows at both levels: `role_permissions` references
    // `permissions`, and `workspace_role_permissions` references `workspace_permissions`, each with
    // ON DELETE RESTRICT.
    await queryRunner.query(
      `DELETE FROM workspace_role_permissions WHERE workspace_permission_id = ANY($1)`,
      [grantedWorkspacePermissionIds],
    );
    await queryRunner.manager.delete(
      'workspace_permissions',
      grantedWorkspacePermissionIds,
    );

    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission_id = ANY($1)`,
      [grantedWarehousePermissionIds],
    );
    await queryRunner.manager.delete(
      'permissions',
      grantedWarehousePermissionIds,
    );
  }
}
