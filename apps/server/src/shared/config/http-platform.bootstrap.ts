import type { NestExpressApplication } from '@nestjs/platform-express';
import type { HttpPlatformConfig } from 'shared/config/http-platform.config';
import { OriginPolicy } from 'shared/config/origin-policy';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

interface OriginRequest {
  readonly method: string;
  readonly originalUrl: string;
  get(header: 'origin'): string | undefined;
}

type Next = (error?: unknown) => void;

export const configureHttpPlatform = (
  app: NestExpressApplication,
  config: HttpPlatformConfig,
): void => {
  const originPolicy = new OriginPolicy(config.allowedOrigins);

  app.enableCors({
    credentials: true,
    origin: (origin, callback) =>
      originPolicy.verifyCorsOrigin(origin, callback),
  });
  app.use((request: OriginRequest, _response: unknown, next: Next): void => {
    try {
      if (request.originalUrl.startsWith('/api/v1/auth/')) {
        originPolicy.assertStateChangingOrigin(
          request.method,
          request.get('origin'),
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  });
  app.useGlobalFilters(new GlobalHttpExceptionFilter());
};
