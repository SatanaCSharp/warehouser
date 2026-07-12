import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from 'app.module.js';
import { ZodValidationPipe } from 'nestjs-zod';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ZodValidationPipe());
  app.enableCors();
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server running on port: ${port}`);
}

void bootstrap();
