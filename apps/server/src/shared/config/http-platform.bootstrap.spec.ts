import { ForbiddenException } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpPlatform } from 'shared/config/http-platform.bootstrap';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

describe('configureHttpPlatform', () => {
  it('enables credentialed CORS, origin enforcement, and the safe global filter', () => {
    const app = {
      enableCors: jest.fn(),
      use: jest.fn(),
      useGlobalFilters: jest.fn(),
    } as unknown as NestExpressApplication;

    configureHttpPlatform(app, {
      allowedOrigins: ['https://app.example.test'],
      secureCookies: true,
    });

    expect(app.enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: true,
        origin: expect.any(Function),
      }),
    );
    expect(app.use).toHaveBeenCalledWith(expect.any(Function));
    expect(app.useGlobalFilters).toHaveBeenCalledWith(
      expect.any(GlobalHttpExceptionFilter),
    );

    const middleware = (app.use as jest.Mock).mock.calls[0]?.[0] as (
      request: {
        method: string;
        originalUrl: string;
        get(name: 'origin'): string | undefined;
      },
      response: unknown,
      next: (error?: unknown) => void,
    ) => void;
    const authNext = jest.fn();
    const unrelatedNext = jest.fn();

    middleware(
      {
        method: 'POST',
        originalUrl: '/api/v1/auth/sign-in',
        get: () => 'https://attacker.example.test',
      },
      {},
      authNext,
    );
    middleware(
      {
        method: 'POST',
        originalUrl: '/api/v1/inventory',
        get: () => undefined,
      },
      {},
      unrelatedNext,
    );

    expect(authNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
    expect(unrelatedNext).toHaveBeenCalledWith();
  });
});
