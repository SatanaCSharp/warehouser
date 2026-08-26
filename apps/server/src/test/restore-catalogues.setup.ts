import { DataSource } from 'typeorm';

import { initialPermissions } from '../../migrations/1785859200000-CreateAccessSchema';
import { newPermissions as newUsersManagementPermissions } from '../../migrations/1786025100000-GrantUsersManagementPermissions';
import { initialWorkspacePermissions } from '../../migrations/1786524800000-CreateWorkspaceAuthoritySchema';
import { newPermissions as newOrderingPermissions } from '../../migrations/1786600100000-GrantOrderingPermissions';

/**
 * `permissions` and `workspace_permissions` are catalogue tables: the migrations
 * seed them once and nothing re-seeds them afterwards. Many integration specs
 * `TRUNCATE ... CASCADE` them between tests, which is harmless inside a suite
 * that seeds its own rows, but permanently destroys the catalogue for every
 * suite that runs later in the same process — and, because migrations do not
 * run again, for every later run against the same database too.
 *
 * Restoring the catalogue around every spec file keeps suites order-independent
 * without changing what any of them truncate. The rows come from the migrations
 * themselves so the two cannot drift.
 *
 * Fixture rows are deliberately excluded: `buildWorkspacePermission` generates
 * ids prefixed `WORKSPACE_PERMISSIONS_FIXTURE:` precisely so fixture data stays
 * distinguishable from catalogue data.
 */
const catalogues = [
  {
    table: 'permissions',
    rows: [
      ...initialPermissions,
      ...newUsersManagementPermissions,
      ...newOrderingPermissions,
    ],
  },
  {
    table: 'workspace_permissions',
    rows: [...initialWorkspacePermissions],
  },
] as const;

/**
 * Restoring is not enough on its own. A spec that inserts a fixture Permission
 * and then fails — or is interrupted — before its own cleanup leaves that row
 * in the catalogue for good, and a catalogue id is a closed `z.enum` in
 * `packages/contracts`: one unknown id fails validation for the entire
 * catalogue response and blanks every screen that reads it. Sweeping the
 * reserved prefix keeps a crashed run from outliving itself.
 *
 * The grants go first because `fk_workspace_role_permissions_permission` is
 * `ON DELETE RESTRICT`, so a fixture Permission still referenced by a Role
 * cannot be removed while that grant exists.
 */
const fixtureSweeps = [
  {
    table: 'workspace_permissions',
    grantTable: 'workspace_role_permissions',
    grantColumn: 'workspace_permission_id',
    idPrefix: 'WORKSPACE_PERMISSIONS_FIXTURE:',
  },
] as const;

const restoreCatalogues = async (): Promise<void> => {
  // A dedicated connection, so this never interferes with the shared
  // `dataSource` singleton each spec initializes and destroys itself.
  const connection = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'warehouser',
    password: process.env.DATABASE_PASSWORD ?? 'warehouser',
    database: process.env.DATABASE_NAME ?? 'warehouser',
    synchronize: false,
  });

  await connection.initialize();

  try {
    for (const { table, grantTable, grantColumn, idPrefix } of fixtureSweeps) {
      await connection.query(
        `DELETE FROM ${grantTable} WHERE ${grantColumn} LIKE $1`,
        [`${idPrefix}%`],
      );
      await connection.query(`DELETE FROM ${table} WHERE id LIKE $1`, [
        `${idPrefix}%`,
      ]);
    }

    for (const { table, rows } of catalogues) {
      const values = rows
        .map(
          (_row, index) =>
            `($${index * 3 + 1}, $${index * 3 + 2}, $${index * 3 + 3})`,
        )
        .join(', ');

      await connection.query(
        `INSERT INTO ${table} (id, label, kind) VALUES ${values} ON CONFLICT (id) DO NOTHING`,
        rows.flatMap(([id, label, kind]) => [id, label, kind]),
      );
    }
  } finally {
    await connection.destroy();
  }
};

if (process.env.RUN_INTEGRATION === '1') {
  // Before, so a database left corrupted by an earlier run is repaired; after,
  // so this file's own truncations do not leak into the next suite.
  beforeAll(restoreCatalogues);
  afterAll(restoreCatalogues);
}
