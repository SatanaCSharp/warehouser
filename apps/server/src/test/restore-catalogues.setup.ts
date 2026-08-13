import { DataSource } from 'typeorm';

import { initialPermissions } from '../../migrations/1785859200000-CreateAccessSchema';
import { newPermissions } from '../../migrations/1786025100000-GrantUsersManagementPermissions';
import { initialWorkspacePermissions } from '../../migrations/1786524800000-CreateWorkspaceAuthoritySchema';

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
    rows: [...initialPermissions, ...newPermissions],
  },
  {
    table: 'workspace_permissions',
    rows: [...initialWorkspacePermissions],
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
