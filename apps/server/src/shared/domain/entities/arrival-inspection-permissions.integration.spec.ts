import { join } from 'node:path';

import { PermissionId } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source';
import { persistWorkspaceGraph } from 'test/factories/entity-factories';

/**
 * The RED for T2 —
 * `docs/features/arrival-inspection/tasks/grant-arrival-inspection-permissions-migration.md`.
 *
 * Extends the proof shape `delivery-address-permissions.integration.spec.ts`
 * established: `apps/server/AGENTS.md` forbids tests for migration classes, so
 * nothing here names one. It asserts the catalogue and the grants the migration
 * lane leaves behind, and drives the lane through `DataSource` — its tip, never
 * a class — where a grant must be observed against a Role that already existed.
 *
 * That last part is what the delivery-addresses spec could not express and this
 * task's Definition of Done requires ("every protected `warehouse_manager` Role
 * that existed before the migration holds all three afterwards"). The template
 * this tier restores was migrated against an empty database, where no Role
 * exists for a grant to reach. Seeding the Roles first and then replaying the
 * lane's tip over them puts the Roles on the pre-existing side of the grant,
 * which is exactly the production situation the `NOT EXISTS`-guarded
 * `INSERT … SELECT` is written for (`apps/server/migrations/README.md`
 * § "Extending a Permission catalogue").
 *
 * Covers AC-01a, AC-20, AC-22 and AC-26 at the level they are decided — no
 * refusal can be raised, read or amended by a capability that has no catalogue
 * row, no grant and no `PermissionId` member.
 */
interface CatalogueRow {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

interface GrantRow {
  readonly role_id: string;
  readonly permission_id: string;
}

// Copied from the staged migration
// `docs/features/arrival-inspection/migrations/02-grant-arrival-inspection-permissions.ts`,
// which `data-model.md` § Migrations names as the source of the three rows.
// `spec.md` §6.1 fixes all three at the Warehouse level, and every one is
// `assignable` — none is reserved, because a Workspace Owner must be able to
// delegate each to a custom Role (`spec.md` §8, fifth question).
const introducedPermissions = [
  {
    id: 'REJECTIONS:CREATE',
    label: 'Refuse part of what a purchase draft line presented',
  },
  {
    id: 'REJECTIONS:WATCH',
    label: "View a rejection's reason, description and disposition",
  },
  {
    id: 'REJECTIONS:UPDATE',
    label: "Amend a rejection's description or disposition",
  },
] as const;

const introducedIds = introducedPermissions.map((entry) => entry.id);

const readCatalogue = async (): Promise<CatalogueRow[]> => {
  const rows: unknown = await dataSource.query(
    `SELECT id, label, kind FROM permissions ORDER BY id`,
  );

  return rows as CatalogueRow[];
};

const readGrantsOf = async (roleId: string): Promise<string[]> => {
  const rows: unknown = await dataSource.query(
    `SELECT role_id, permission_id FROM role_permissions
     WHERE role_id = $1 AND permission_id = ANY($2) ORDER BY permission_id`,
    [roleId, introducedIds],
  );

  return (rows as GrantRow[]).map((row) => row.permission_id);
};

const describeCatalogue = (): void => {
  describe('AC-01a / AC-20 / AC-22 — the three Warehouse Permissions the feature introduces', () => {
    it.each(introducedPermissions)(
      'seeds $id as assignable catalogue data, label included',
      async ({ id, label }) => {
        const catalogue = await readCatalogue();

        expect(catalogue).toContainEqual({ id, label, kind: 'assignable' });
      },
    );

    it('reserves none of them — a Workspace Owner must be able to delegate each', async () => {
      const catalogue = await readCatalogue();
      const wanted = new Set<string>(introducedIds);

      expect(
        catalogue.filter((row) => wanted.has(row.id)).map((row) => row.kind),
      ).toEqual(['assignable', 'assignable', 'assignable']);
    });

    it('adds no Workspace Permission — nothing here touches the Warehouse record itself', async () => {
      const rows: unknown = await dataSource.query(
        `SELECT id FROM workspace_permissions WHERE id LIKE 'REJECTIONS:%'`,
      );

      expect(rows).toEqual([]);
    });
  });
};

const describeVocabularyAgreement = (): void => {
  describe('the shared vocabulary and the seeded catalogue name the same capabilities', () => {
    // Stated in both directions, as the delivery-addresses spec states it. A
    // member with no row is a capability no Role can ever hold; a row with no
    // member is a capability nothing in the codebase can name. Either is silent
    // until a request is refused in production.
    it('declares a PermissionId member for every Warehouse catalogue row and no other', async () => {
      const catalogue = await readCatalogue();

      expect(Object.values<string>(PermissionId).slice().sort()).toEqual(
        catalogue.map((row) => row.id).sort(),
      );
    });
  });
};

const describeGrantOverPreExistingRoles = (): void => {
  describe('AC-01a / AC-26 — the grant reaches the protected Roles that already existed', () => {
    it('grants all three to every protected warehouse_manager Role and to no custom Role', async () => {
      const graph = await persistWorkspaceGraph();
      const managerRoles: unknown = await dataSource.query(
        `SELECT id, kind FROM roles WHERE warehouse_id = ANY($1) ORDER BY kind`,
        [[graph.activeWarehouseId, graph.archivedWarehouseId]],
      );
      const roles = managerRoles as { id: string; kind: string }[];
      const protectedRoles = roles.filter(
        (role) => role.kind === 'warehouse_manager',
      );
      const customRoles = roles.filter((role) => role.kind === 'custom');

      // The lane's tip is the grant migration (`1786800100000`, the highest
      // timestamp in `apps/server/migrations`). Reverting and replaying it puts
      // the Roles above on the pre-existing side of its `INSERT … SELECT`.
      await dataSource.undoLastMigration();
      const reverted = await readCatalogue();
      await dataSource.runMigrations();

      // The revert removes exactly what the apply added: catalogue rows and
      // grants both, the grants first because `role_permissions` references
      // `permissions` with ON DELETE RESTRICT.
      expect(reverted.map((row) => row.id)).toEqual(
        expect.not.arrayContaining([...introducedIds]),
      );
      expect(protectedRoles).toHaveLength(2);
      for (const role of protectedRoles) {
        expect(await readGrantsOf(role.id)).toEqual(
          [...introducedIds].sort((left, right) => left.localeCompare(right)),
        );
      }
      for (const role of customRoles) {
        expect(await readGrantsOf(role.id)).toEqual([]);
      }
    });
  });
};

describe('the arrival-inspection Permission catalogue', () => {
  beforeAll(async () => {
    // The lane the tip is replayed from. `pglite-data-source.ts` configures no
    // migrations, because every spec but this one reads the already-migrated
    // template; this spec needs the lane itself.
    //
    // The lane names the one migration this spec is about, never a glob: with a
    // glob, `undoLastMigration()` reverts whatever migration happens to hold the
    // highest timestamp, so the day another feature's migration lands after this
    // one the assertions below would quietly prove nothing. Named explicitly, a
    // later tip makes TypeORM fail to find it here and this spec breaks loudly
    // instead of passing while testing the wrong migration.
    dataSource.setOptions({
      migrations: [
        join(
          process.cwd(),
          'migrations/1786800100000-GrantArrivalInspectionPermissions.ts',
        ),
      ],
    });
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeCatalogue();
  describeVocabularyAgreement();
  describeGrantOverPreExistingRoles();
});
