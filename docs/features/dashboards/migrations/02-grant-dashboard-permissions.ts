import type { MigrationInterface, QueryRunner } from 'typeorm';

// The whole of this feature's stored-data footprint: one Workspace Permission
// (`spec.md` §1, second boundary; `sad.md` §7). No Warehouse Permission is added — the four Panels
// of the Warehouse Dashboard are authorized by `ITEMS:WATCH`, `CUSTOMER_ORDERS:WATCH`,
// `PURCHASE_DRAFTS:WATCH` and `REJECTIONS:WATCH`, every one of which already exists.
//
// **One entry, not one per record family** — `spec.md` §8's eighth question at its stated default.
// The surface is read as a whole and granted as a whole; four keys would let a Workspace Role see
// Demand Pressure without Receipt Reliability, which no user story asks for and which the
// Dashboard's fixed four-Panel layout has no way to present (`data-model.md` § The one catalogue
// row).
//
// `WAREHOUSE_PERFORMANCE:WATCH`, not `sad.md` §5's working name `WAREHOUSE_PERFORMANCE:OBSERVE`:
// `WATCH` is the read verb of *both* catalogues without exception — `WAREHOUSES:WATCH`,
// `WORKSPACE_MEMBERS:WATCH`, `ITEMS:WATCH`, `REJECTIONS:WATCH` — and `OBSERVE` would be a second
// verb meaning the same thing. The subject distinguishes it from the `WAREHOUSES:WATCH` that
// already exists at this level and means seeing that the Warehouses exist and what they are called.
//
// `assignable`, like every Workspace catalogue row but `WORKSPACE_OWNER_ROLE:REASSIGN`: AC-21
// requires a Workspace Owner to be able to delegate it to a custom Role carrying no Workspace
// administration.
export const newWorkspacePermissions = [
  ['WAREHOUSE_PERFORMANCE:WATCH', 'View warehouse performance', 'assignable'],
] as const;

const grantedWorkspacePermissionIds = newWorkspacePermissions.map(([id]) => id);

export class GrantDashboardPermissions1786900100000 implements MigrationInterface {
  // Follows `apps/server/migrations/README.md` § Extending a Permission catalogue at the Workspace
  // level, and `1786700200000-GrantDeliveryAddressPermissions.ts` as its model: insert the
  // catalogue row, then grant it to every protected Role that already exists, because provisioning
  // only granted the set known when each Role was created (AC-21a).

  async up(queryRunner: QueryRunner): Promise<void> {
    // `queryRunner.manager.insert` maps **entity property names**, so this object is
    // `{ id, label, kind }` — all three columns happen to be single-word, but the raw grant below
    // is written in snake_case because it is SQL. Mixing the two conventions is the failure that
    // passes the PGlite tier and vanishes in production (`sad.md` §7).
    await queryRunner.manager.insert(
      'workspace_permissions',
      newWorkspacePermissions.map(([id, label, kind]) => ({ id, label, kind })),
    );

    // AC-21a — every Workspace Owner Role established before this release carries the Permission
    // afterwards, and no custom Role gains it. The composite
    // `(workspace_role_id, workspace_permission_id, workspace_role_kind, workspace_permission_kind)`
    // is what `workspace_role_permissions` requires; `NOT EXISTS` makes a re-apply a no-op.
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
    // Grants before the catalogue row: `workspace_role_permissions` references
    // `workspace_permissions` with ON DELETE RESTRICT.
    await queryRunner.query(
      `DELETE FROM workspace_role_permissions WHERE workspace_permission_id = ANY($1)`,
      [grantedWorkspacePermissionIds],
    );
    await queryRunner.manager.delete(
      'workspace_permissions',
      grantedWorkspacePermissionIds,
    );
  }
}
