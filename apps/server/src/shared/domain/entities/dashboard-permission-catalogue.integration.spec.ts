import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import {
  buildWorkspace,
  buildWorkspaceRole,
} from 'test/factories/entity-factories';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T2 —
 * `docs/features/dashboards/tasks/dashboard-permission-catalogue-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — exactly as
 * `delivery-address-permissions.integration.spec.ts` does for its own grant migration — this
 * names no migration and asserts only the catalogue the migration leaves behind, against the
 * already-migrated template this tier restores.
 *
 * AC-21a's grant-backfill half ("every `workspace_owner` Role that existed before the apply
 * carries the Permission afterwards, and no custom Role gains it") is **not expressible at this
 * tier at all**, for the same reason `delivery-address-permissions.integration.spec.ts` documents:
 * the template is migrated against an empty database, where `workspace_roles` holds no row for
 * migration `02`'s `INSERT … SELECT` to reach. There is no pre-existing Role here for a spec to
 * observe the grant landing on. That half is executed by hand against a database seeded with
 * Roles first — `data-model.md` § Safe evolution records exactly that probe — and the run belongs
 * in the task's commit message, not in this file.
 *
 * What this tier CAN observe, and what the two traps in the task's Notes land on:
 *  - the catalogue row's stored field values (`id`, `label`, `kind`), which is where a
 *    `queryRunner.manager.insert` naming-world mistake would silently surface as a missing or
 *    malformed row rather than a thrown error;
 *  - that the row's `kind = 'assignable'` genuinely admits the Permission on a custom Role through
 *    `chk_workspace_role_permissions_reserved_exclusive`, proven by actually inserting that grant
 *    rather than asserting the constraint's existence;
 *  - that the shared vocabulary and the seeded catalogue name the same capability, in both
 *    directions.
 *
 * Covers AC-21.
 */
interface CatalogueRow {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

const PERMISSION_ID = 'WAREHOUSE_PERFORMANCE:WATCH';

const readWorkspaceCatalogue = async (): Promise<CatalogueRow[]> => {
  const rows = (await dataSource.query(
    `SELECT id, label, kind FROM workspace_permissions ORDER BY id`,
  )) as CatalogueRow[];

  return rows;
};

/** A bare Workspace with one custom Workspace Role, nothing else — the minimum this file needs. */
const seedWorkspaceWithCustomRole = async (): Promise<{
  readonly workspaceId: string;
  readonly customRoleId: string;
}> => {
  const workspace = buildWorkspace();
  await dataSource.manager.getRepository(WorkspaceEntity).insert(workspace);
  const workspaceId = workspace.id as string;

  const customRole = buildWorkspaceRole({ workspaceId, kind: 'custom' });
  await dataSource.manager
    .getRepository(WorkspaceRoleEntity)
    .insert(customRole);

  return { workspaceId, customRoleId: customRole.id as string };
};

describe('the WAREHOUSE_PERFORMANCE:WATCH catalogue row (AC-21)', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      `TRUNCATE workspace_role_permissions, workspace_roles, workspaces CASCADE`,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('is seeded as assignable catalogue data, with the documented label, and only once', async () => {
    const catalogue = await readWorkspaceCatalogue();

    // Asserted as one row, not merely `toContainEqual`: a naming-world mistake in
    // `queryRunner.manager.insert` (entity property names, not the raw SQL grant's snake_case)
    // would leave the row missing or with a null/default `label`/`kind` rather than throwing, so
    // the stored values — not just row existence — are what must be checked.
    expect(catalogue.filter((row) => row.id === PERMISSION_ID)).toEqual([
      {
        id: PERMISSION_ID,
        label: 'View warehouse performance',
        kind: 'assignable',
      },
    ]);
  });

  it('admits the Permission on a custom Workspace Role (chk_workspace_role_permissions_reserved_exclusive)', async () => {
    const { customRoleId } = await seedWorkspaceWithCustomRole();

    // `assignable` is what makes this insert legal at all — a `reserved` catalogue row would
    // violate `chk_workspace_role_permissions_reserved_exclusive` on a `custom` Role. Actually
    // performing the grant, rather than asserting the constraint's text, is what proves the row
    // is admissible rather than merely present.
    await dataSource.manager
      .getRepository(WorkspaceRolePermissionEntity)
      .insert({
        workspaceRoleId: customRoleId,
        workspacePermissionId: PERMISSION_ID,
        workspaceRoleKind: 'custom',
        workspacePermissionKind: 'assignable',
      });

    const grants = (await dataSource.query(
      `SELECT workspace_role_id, workspace_permission_id, workspace_role_kind, workspace_permission_kind
       FROM workspace_role_permissions
       WHERE workspace_role_id = $1`,
      [customRoleId],
    )) as Array<{
      workspace_role_id: string;
      workspace_permission_id: string;
      workspace_role_kind: string;
      workspace_permission_kind: string;
    }>;

    expect(grants).toEqual([
      {
        workspace_role_id: customRoleId,
        workspace_permission_id: PERMISSION_ID,
        workspace_role_kind: 'custom',
        workspace_permission_kind: 'assignable',
      },
    ]);
  });
});

describe('the shared vocabulary and the seeded Workspace catalogue name the same capabilities', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  // Stated in both directions, as `delivery-address-permissions.integration.spec.ts` does: a
  // member with no row is a capability no Role can ever hold; a row with no member is a capability
  // nothing in the codebase can name.
  it('declares a WorkspacePermissionId member for every Workspace catalogue row and no other', async () => {
    const catalogue = await readWorkspaceCatalogue();

    expect(Object.values(WorkspacePermissionId).slice().sort()).toEqual(
      catalogue.map((row) => row.id).sort(),
    );
  });
});
