import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import dataSource from 'shared/database/data-source.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The RED for T3 —
 * `docs/features/delivery-addresses/tasks/grant-delivery-address-permissions-migration.md`.
 *
 * `apps/server/AGENTS.md` forbids tests for migration classes, so — as
 * `customer-schema.integration.spec.ts` and
 * `delivery-destinations-schema.integration.spec.ts` did before it — this names
 * no migration and asserts only the catalogue the migrations leave behind.
 *
 * The grant half of the task's Definition of Done ("every Permission reaches
 * every Role that already exists") is not expressible here: this tier's template
 * is migrated against an empty database, where there is no pre-existing Role for
 * a grant to reach. That half was executed separately against a database seeded
 * with Roles first, and the run is recorded in the task's commit message.
 *
 * Covers AC-02, AC-09, AC-10 and AC-23 at the level they are decided — a
 * capability nothing downstream can name before its catalogue row and its
 * `PermissionId` member both exist.
 */
interface CatalogueRow {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

const readCatalogue = async (table: string): Promise<CatalogueRow[]> => {
  const rows: unknown = await dataSource.query(
    `SELECT id, label, kind FROM ${table} ORDER BY id`,
  );

  return rows as CatalogueRow[];
};

const describeWarehouseCatalogue = (): void => {
  describe('AC-02 / AC-09 / AC-23 — the four Warehouse Permissions the feature introduces', () => {
    const introduced = [
      {
        id: 'CUSTOMERS:WATCH',
        label: 'View customers and their delivery addresses',
      },
      { id: 'CUSTOMERS:CREATE', label: 'Record customers' },
      {
        id: 'CUSTOMERS:UPDATE',
        label: 'Update customers and their delivery addresses',
      },
      {
        id: 'CUSTOMERS:DEACTIVATE',
        label: 'Deactivate and reactivate customers',
      },
    ];

    it.each(introduced)(
      'seeds $id as assignable catalogue data, label included',
      async ({ id, label }) => {
        const catalogue = await readCatalogue('permissions');

        expect(catalogue).toContainEqual({ id, label, kind: 'assignable' });
      },
    );

    it('reserves none of them — a Workspace Owner must be able to delegate each', async () => {
      const catalogue = await readCatalogue('permissions');
      const introducedIds = new Set(introduced.map((entry) => entry.id));

      expect(
        catalogue
          .filter((row) => introducedIds.has(row.id))
          .map((row) => row.kind),
      ).toEqual(['assignable', 'assignable', 'assignable', 'assignable']);
    });
  });
};

const describeWorkspaceCatalogue = (): void => {
  describe('AC-10 — recording a Warehouse’s own Delivery Address is a Workspace Capability', () => {
    it('seeds WAREHOUSES:ADDRESS_UPDATE at the Workspace level, not the Warehouse one', async () => {
      const workspaceCatalogue = await readCatalogue('workspace_permissions');
      const warehouseCatalogue = await readCatalogue('permissions');

      expect(workspaceCatalogue).toContainEqual({
        id: 'WAREHOUSES:ADDRESS_UPDATE',
        label: 'Record warehouse delivery addresses',
        kind: 'assignable',
      });
      // The level is the point: `sad.md` §4 places it beside renaming and
      // archiving a Warehouse, which are Workspace Capabilities. Seeding it at
      // both levels would make either level's guard look correct.
      expect(warehouseCatalogue.map((row) => row.id)).not.toContain(
        'WAREHOUSES:ADDRESS_UPDATE',
      );
    });
  });
};

const describeVocabularyAgreement = (): void => {
  describe('the shared vocabulary and the seeded catalogue name the same capabilities', () => {
    // Stated in both directions on purpose. A member with no row is a
    // capability no Role can ever hold; a row with no member is a capability
    // nothing in the codebase can name. Either is silent until a request is
    // refused in production, so both are asserted here rather than assumed.
    it('declares a PermissionId member for every Warehouse catalogue row and no other', async () => {
      const catalogue = await readCatalogue('permissions');

      expect(Object.values(PermissionId).slice().sort()).toEqual(
        catalogue.map((row) => row.id).sort(),
      );
    });

    it('declares a WorkspacePermissionId member for every Workspace catalogue row and no other', async () => {
      const catalogue = await readCatalogue('workspace_permissions');

      expect(Object.values(WorkspacePermissionId).slice().sort()).toEqual(
        catalogue.map((row) => row.id).sort(),
      );
    });
  });
};

describe('the delivery-address Permission catalogue', () => {
  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describeWarehouseCatalogue();
  describeWorkspaceCatalogue();
  describeVocabularyAgreement();
});
