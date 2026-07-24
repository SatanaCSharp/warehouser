import type { BullRootModuleOptions } from '@nestjs/bullmq';
import type { ConfigService } from '@nestjs/config';

export const createBullMqOptions = (
  config: Pick<ConfigService, 'get'>,
): BullRootModuleOptions => ({
  connection: {
    host: config.get('REDIS_HOST', 'localhost'),
    port: config.get('REDIS_PORT', 6379),
    username: config.get('REDIS_USERNAME'),
    password: config.get('REDIS_PASSWORD'),
  },
});
