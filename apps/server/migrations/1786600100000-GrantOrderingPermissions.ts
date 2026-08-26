import type { MigrationInterface, QueryRunner } from 'typeorm';

// spec.md §6.1 fixes the sixteen Warehouse Permissions this feature introduces. Every one of them
// is `assignable`: none is reserved to the protected Warehouse Manager Role, because a Workspace
// Owner must be able to delegate each capability to a custom Warehouse Role.
export const newPermissions = [
  ['ITEMS:WATCH', 'View items', 'assignable'],
  ['ITEMS:CREATE', 'Create items', 'assignable'],
  ['ITEMS:UPDATE', 'Update items', 'assignable'],
  ['ITEMS:DEACTIVATE', 'Deactivate and reactivate items', 'assignable'],
  ['ITEM_STOCK:ADJUST', 'Adjust on-hand quantity', 'assignable'],
  ['CUSTOMER_ORDERS:WATCH', 'View customer orders and demand', 'assignable'],
  ['CUSTOMER_ORDERS:CREATE', 'Record customer orders', 'assignable'],
  ['CUSTOMER_ORDERS:UPDATE', 'Amend customer orders', 'assignable'],
  ['CUSTOMER_ORDERS:CANCEL', 'Cancel customer orders', 'assignable'],
  ['PURCHASE_DRAFTS:WATCH', 'View purchase drafts', 'assignable'],
  ['PURCHASE_DRAFTS:CREATE', 'Create purchase drafts', 'assignable'],
  ['PURCHASE_DRAFTS:UPDATE', 'Update purchase drafts', 'assignable'],
  ['PURCHASE_DRAFTS:READY', 'Move purchase drafts to ready', 'assignable'],
  ['PURCHASE_DRAFTS:RECEIVE', 'Confirm purchase draft arrivals', 'assignable'],
  ['PURCHASE_DRAFTS:CLOSE', 'Close purchase drafts', 'assignable'],
  ['PURCHASE_DRAFTS:DISCARD', 'Discard purchase drafts', 'assignable'],
] as const;

const grantedPermissionIds = newPermissions.map(([id]) => id);

export class GrantOrderingPermissions1786600100000 implements MigrationInterface {
  // Follows `apps/server/migrations/README.md` § Extending a Permission catalogue: insert the
  // catalogue rows, then grant them to every protected Warehouse Manager Role that already exists,
  // because provisioning only granted the set known when each Role was created (spec.md §6.1).

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
    // Grants go before the catalogue rows: `role_permissions` references `permissions` with
    // ON DELETE RESTRICT.
    await queryRunner.query(
      `DELETE FROM role_permissions WHERE permission_id = ANY($1)`,
      [grantedPermissionIds],
    );

    await queryRunner.manager.delete('permissions', grantedPermissionIds);
  }
}
