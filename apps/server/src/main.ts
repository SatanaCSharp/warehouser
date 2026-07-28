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
