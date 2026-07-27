import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'app.module.js';
import { PinoLogger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { configureHttpPlatform } from 'shared/config/http-platform.bootstrap.js';
import { readHttpPlatformConfig } from 'shared/config/http-platform.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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
  const logger = app.get(PinoLogger);
  logger.setContext('Bootstrap');
  logger.info({ port }, 'Server running');
}

void bootstrap();
