import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'app.module';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { configureHttpPlatform } from 'shared/config/http-platform.bootstrap';
import { readHttpPlatformConfig } from 'shared/config/http-platform.config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  // An explicit ceiling on a request body rather than express's implicit 100 KB default. Every
  // endpoint of this service takes a small JSON document — the largest is a Purchase Draft with its
  // lines and links, bounded in `@warehouser/contracts` — and the size of an accepted body is what
  // prices validation: a rejected array is refused element by element, and NestJS runs guards
  // *before* pipes, so the rate limiter never sees the request that pays for it. The byte ceiling
  // and the contracts' element ceilings are independent guards and the tighter one simply wins;
  // 128 KB comfortably carries a two-hundred-line draft with its links, which is already far past
  // anything assembled by hand. Registered here, before `app.init()`, so it is the `jsonParser`
  // layer Nest then finds already applied and does not add its own default-limit one on top.
  app.useBodyParser('json', { limit: '128kb' });
  app.useGlobalPipes(new ZodValidationPipe());
  configureHttpPlatform(
    app,
    readHttpPlatformConfig({
      APP_ORIGINS: process.env.APP_ORIGINS,
      AUTH_COOKIE_SECURE: process.env.AUTH_COOKIE_SECURE,
      NODE_ENV: process.env.NODE_ENV,
    }),
  );
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log({ port }, 'Bootstrap');
}

void bootstrap();
