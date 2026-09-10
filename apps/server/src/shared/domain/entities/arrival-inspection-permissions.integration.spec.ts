import { PermissionId } from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T2 —
 * `docs/features/arrival-inspection/tasks/grant-arrival-inspection-permissions-migration.md`.
 *
 * Follows the proof shape `delivery-address-permissions.integration.spec.ts`
 * established: `guides/adding-a-server-module.md` §3 and `apps/server/AGENTS.md`
 * forbid tests for migration classes, so nothing here names one, configures a
 * migration lane, or drives `runMigrations`/`undoLastMigration`. It reads only
 * the already-migrated template this tier restores, and asserts the catalogue
 * state the migration lane left behind.
 *
 * Deliberately **not** asserted here: "every protected `warehouse_manager` Role
 * that existed before the migration holds all three afterwards". Proving it in a
 * spec requires reverting and replaying the grant migration, which is the
 * migration test the guide forbids — the template is migrated against an empty
 * database, so no Role exists for the `NOT EXISTS`-guarded `INSERT … SELECT` to
 * reach. That half is verified by hand with `pnpm --filter @warehouser/server
 * migration:revert` and `migration:run` against the development database, as
 * `apps/server/AGENTS.md` directs (code-review-back-end-2026-09-09.md,
 * blocking finding 1).
 *
 * Covers AC-20, AC-22 and AC-26 at the level they are decided — no refusal can
 * be raised, read or amended by a capability that has no catalogue row and no
 * `PermissionId` member.
 */
interface CatalogueRow {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
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

const describeCatalogue = (): void => {
  describe('AC-20 / AC-22 — the three Warehouse Permissions the feature introduces', () => {
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

describe('the arrival-inspection Permission catalogue', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeCatalogue();
  describeVocabularyAgreement();
});
