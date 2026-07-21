import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const createTypeOrmOptions = (
  config: Pick<ConfigService, 'get'>,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get('DATABASE_HOST', 'localhost'),
  port: config.get('DATABASE_PORT', 5432),
  username: config.get('DATABASE_USER', 'warehouser'),
  password: config.get('DATABASE_PASSWORD', 'warehouser'),
  database: config.get('DATABASE_NAME', 'warehouser'),
  autoLoadEntities: true,
  synchronize: false,
});
