import type { MigrationInterface, QueryRunner } from 'typeorm';

// `spec.md` §6.1 fixes the three Permissions this feature introduces. All three are Warehouse-level,
// because the subject of each is a resource a Warehouse owns — the Rejections on its own Purchase
// Draft Lines. No Workspace Permission is added: nothing here touches the Warehouse record itself.
//
// Every one is `assignable`, following `1786700200000-GrantDeliveryAddressPermissions`: none is
// reserved to the protected Role, because a Workspace Owner must be able to delegate each capability
// to a custom Role (`spec.md` §8, fifth question, at its stated default).
//
// `REJECTIONS:` names a **capability**, not a module (`sad.md` §4) — exactly as `ITEM_STOCK:ADJUST`
// does inside `items`. Nothing about this catalogue entry implies a `rejections` module.
export const newWarehousePermissions = [
  [
    'REJECTIONS:CREATE',
    'Refuse part of what a purchase draft line presented',
    'assignable',
  ],
  [
    'REJECTIONS:WATCH',
    "View a rejection's reason, description and disposition",
    'assignable',
  ],
  [
    'REJECTIONS:UPDATE',
    "Amend a rejection's description or disposition",
    'assignable',
  ],
] as const;

const grantedWarehousePermissionIds = newWarehousePermissions.map(([id]) => id);

export class GrantArrivalInspectionPermissions1786800100000 implements MigrationInterface {
  // Follows `apps/server/migrations/README.md` § Extending a Permission catalogue: insert the
  // catalogue rows, then grant them to every protected Role that already exists, because
  // provisioning only granted the set known when each Role was created.
  //
  // The consequence `spec.md` §8 names is real and is not repaired here: a member on a **custom**
  // Role holds none of these on deployment morning, so they can record only an ending that refuses
  // nothing — which is indistinguishable from the feature working. Granting them to custom Roles is
  // an administrator's decision and never a migration's.

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
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Grants before the catalogue rows: `role_permissions` references `permissions` with
    // ON DELETE RESTRICT.
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
