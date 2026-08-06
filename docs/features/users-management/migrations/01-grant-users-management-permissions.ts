import type { MigrationInterface, QueryRunner } from 'typeorm';

const newPermissions = [
  ['USERS:EMAIL_UPDATE', 'Update user email', 'assignable'],
  ['USERS:PASSWORD_CHANGE', 'Change user password', 'assignable'],
  ['USERS:DELETE', 'Delete users', 'assignable'],
] as const;

// AC-17 requires USERS:CREATE reasserted alongside the three new Permissions; the idempotent
// grant below is a safe no-op for USERS:CREATE since every existing Warehouse Manager Role
// already holds it from provisioning.
const grantedPermissionIds = [
  'USERS:CREATE',
  'USERS:EMAIL_UPDATE',
  'USERS:PASSWORD_CHANGE',
  'USERS:DELETE',
] as const;

export class GrantUsersManagementPermissions implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.manager.insert(
      'permissions',
      newPermissions.map(([id, label, kind]) => ({ id, label, kind })),
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
      [grantedPermissionIds],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const newPermissionIds = newPermissions.map(([id]) => id);

    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission_id = ANY($1)`,
      [newPermissionIds],
    );

    await queryRunner.manager.delete('permissions', newPermissionIds);
  }
}
