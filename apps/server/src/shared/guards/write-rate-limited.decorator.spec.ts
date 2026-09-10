import { Reflector } from '@nestjs/core';
import {
  WRITE_RATE_LIMITED_KEY,
  WriteRateLimited,
} from 'shared/guards/write-rate-limited.decorator';
import { describe, expect, it } from 'vitest';

// ADR 0003 / sad §5 `shared/guards/write-rate-limit.guard.ts`: mutating handlers opt in to the
// per-member write rate limit by declaring `@WriteRateLimited()`. This proves the decorator sets
// its own metadata key so `WriteRateLimitGuard` can read it with `Reflector#getAllAndOverride`,
// exactly as `@RequiredPermission` and `@ArchivedTolerantRead` do for the access guards.

describe('WriteRateLimited', () => {
  it('declares the write-rate-limited metadata on the handler', () => {
    class TestController {
      @WriteRateLimited()
      handler(): void {
        // no-op: only the decorator metadata is under test
      }
    }

    const reflector = new Reflector();

    expect(
      reflector.get<boolean>(
        WRITE_RATE_LIMITED_KEY,
        TestController.prototype.handler,
      ),
    ).toBe(true);
  });

  it('leaves a handler with no decorator carrying no write-rate-limited metadata', () => {
    class TestController {
      handler(): void {
        // no-op: proves the absence of the decorator leaves no metadata behind
      }
    }

    const reflector = new Reflector();

    expect(
      reflector.get<boolean | undefined>(
        WRITE_RATE_LIMITED_KEY,
        TestController.prototype.handler,
      ),
    ).toBeUndefined();
  });
});
