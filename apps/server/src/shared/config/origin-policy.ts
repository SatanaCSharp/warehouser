import { ForbiddenException } from '@nestjs/common';

type CorsOriginCallback = (error: Error | null, allowed?: boolean) => void;

const stateChangingMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

export class OriginPolicy {
  private readonly allowedOrigins: ReadonlySet<string>;

  constructor(allowedOrigins: readonly string[]) {
    this.allowedOrigins = new Set(allowedOrigins);
  }

  verifyCorsOrigin(
    origin: string | undefined,
    callback: CorsOriginCallback,
  ): void {
    if (origin === undefined || this.allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed'));
  }

  assertStateChangingOrigin(method: string, origin: string | undefined): void {
    if (!stateChangingMethods.has(method.toUpperCase())) {
      return;
    }

    if (origin !== undefined && this.allowedOrigins.has(origin)) {
      return;
    }

    throw new ForbiddenException();
  }
}
