import 'reflect-metadata';

import { join } from 'node:path';

import { DataSource } from 'typeorm';

const databasePort = Number.parseInt(process.env.DATABASE_PORT ?? '5432', 10);
const serverDirectory = process.cwd();
const sourceDirectory = join(serverDirectory, 'src');

export default new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: databasePort,
  username: process.env.DATABASE_USER ?? 'warehouser',
  password: process.env.DATABASE_PASSWORD ?? 'warehouser',
  database: process.env.DATABASE_NAME ?? 'warehouser',
  entities: [join(sourceDirectory, '**/*.entity.ts')],
  migrations: [join(serverDirectory, 'migrations/*.ts')],
  synchronize: false,
});
