/**
 * The standalone DataSource the TypeORM CLI drives (`migration:generate`,
 * `migration:run`, `migration:revert`). The running application never loads it:
 * `app.module.ts` builds its connection from `typeorm.options.ts` with
 * `autoLoadEntities: true`, so nothing here is on the request path.
 *
 * Two things are deliberate under ESM.
 *
 * The entities are the static `entities` barrel rather than a
 * `**\/*.entity.ts` glob. TypeORM loads a glob's matches itself, and in an ESM
 * package it does so with a dynamic `import()` — which cannot load a `.ts`
 * file, because Node's type stripping rejects the first `@Column()` it meets.
 * The barrel hands TypeORM the classes through the module graph instead, and
 * `entity-registry.architectural.spec.ts` fails the build when an entity is
 * missing from it, so the list cannot rot silently.
 *
 * The migrations glob is anchored to this module's own location rather than to
 * `process.cwd()`. The CLI runs the compiled copy of this file
 * (`dist/src/shared/database/data-source.js`), so the sibling migrations are
 * `dist/migrations/*.js`; resolving them from the working directory would mean
 * the same command behaved differently depending on where it was invoked, and
 * would still point at the `.ts` sources the ESM loader cannot read.
 */
import 'reflect-metadata';

import { join } from 'node:path';

import { entities } from 'shared/database/entities.js';
import { DataSource } from 'typeorm';

const databasePort = Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10);
// `dist/src/shared/database` -> `dist/migrations`.
const migrationsDirectory = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'migrations',
);

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: databasePort,
  username: process.env.DATABASE_USER ?? 'warehouser',
  password: process.env.DATABASE_PASSWORD ?? 'warehouser',
  database: process.env.DATABASE_NAME ?? 'warehouser',
  entities,
  migrations: [join(migrationsDirectory, '*.js')],
  synchronize: false,
});
