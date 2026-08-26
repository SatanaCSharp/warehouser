import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

// ADR 0003 / spec.md §6.1 "Draft and demand spam": recording demand, creating drafts and adjusting
// On-hand Quantity are capped at 60 recorded changes per minute per member. The guard is a
// hand-rolled fixed-window counter keyed on the acting member, declared per handler
// with `@WriteRateLimited()`, and composed AFTER `SessionAuthGuard` and `WarehouseAccessGuard` so a
// refusal can never be used to distinguish "this Warehouse has records" from "this Warehouse does
// not" (the non-disclosure property is structural, not a property of the error message).
//
// The window state lives in `WriteRateLimitCounter`, which the guard is given, because Nest builds
// a separate guard instance for every module that names the guard in `@UseGuards(...)`. Each test
// below constructs its own counter, so the per-test isolation these cases rely on is unchanged;
// `write-rate-limit-http-contract.integration.spec.ts` covers the sharing across modules.

const userId = '00000000-0000-4000-8000-000000000001';
const otherUserId = '00000000-0000-4000-8000-000000000002';
const warehouseId = '00000000-0000-4000-8000-000000000009';

const minute = 60_000;

/** A Reflector double answering only the guard's own metadata key, mirroring the pattern the access
 * guards' specs already use so this guard is proven to read its own key. */
const reflectorReturning = (limited: boolean | undefined): Reflector =>
  ({
    getAllAndOverride: jest.fn((key: string) =>
      key === WRITE_RATE_LIMITED_KEY ? limited : undefined,
    ),
  }) as unknown as Reflector;

const contextFor = (request: Record<string, unknown>): ExecutionContext =>
  ({
    getClass: () => class TestController {},
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

/** The shape `WarehouseAccessGuard` attaches once authority is resolved (`shared/access/access-current-user`).
 * Only `userId` and `warehouseId` matter to this guard; the rest is included so a fixture stays
 * realistic. */
const resolvedRequest = (overrides: Record<string, unknown> = {}) => ({
  access: {
    userId,
    warehouseId,
    roleId: '00000000-0000-4000-8000-000000000003',
    roleKind: 'custom' as const,
    permissionId: 'ITEMS:CREATE',
    archived: false,
  },
  ...overrides,
});

describe('WriteRateLimitGuard', () => {
  it('lets an undeclared handler through without counting anything', async () => {
    const clock = jest.fn().mockReturnValue(0);
    const guard = new WriteRateLimitGuard(
      reflectorReturning(undefined),
      new WriteRateLimitCounter(clock),
    );
    const request = resolvedRequest();

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
  });

  describe('per-member per-minute counting', () => {
    it('accepts exactly 60 recorded changes for one member within one window and refuses the 61st', async () => {
      const now = 0;
      const clock = () => now;
      const guard = new WriteRateLimitGuard(
        reflectorReturning(true),
        new WriteRateLimitCounter(clock),
      );
      const request = resolvedRequest();

      for (let i = 0; i < 60; i += 1) {
        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
          true,
        );
      }

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<ApplicationError>({
          code: ErrorCode.ACCESS_WRITE_RATE_LIMITED,
        }),
      );
    });

    it('counts each member independently, so one member reaching the limit never affects another', async () => {
      const now = 0;
      const clock = () => now;
      const guard = new WriteRateLimitGuard(
        reflectorReturning(true),
        new WriteRateLimitCounter(clock),
      );
      const requestForFirstMember = resolvedRequest();
      const requestForSecondMember = resolvedRequest({
        access: { ...resolvedRequest().access, userId: otherUserId },
      });

      for (let i = 0; i < 60; i += 1) {
        await expect(
          guard.canActivate(contextFor(requestForFirstMember)),
        ).resolves.toBe(true);
      }
      await expect(
        guard.canActivate(contextFor(requestForFirstMember)),
      ).rejects.toBeInstanceOf(ApplicationError);

      await expect(
        guard.canActivate(contextFor(requestForSecondMember)),
      ).resolves.toBe(true);
    });
  });

  describe('fixed window reset', () => {
    it('resets the count for a member once a new one-minute window begins', async () => {
      let now = 0;
      const clock = () => now;
      const guard = new WriteRateLimitGuard(
        reflectorReturning(true),
        new WriteRateLimitCounter(clock),
      );
      const request = resolvedRequest();

      for (let i = 0; i < 60; i += 1) {
        await expect(guard.canActivate(contextFor(request))).resolves.toBe(
          true,
        );
      }
      await expect(
        guard.canActivate(contextFor(request)),
      ).rejects.toBeInstanceOf(ApplicationError);

      now += minute;

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    });
  });

  describe('composition after the access guards', () => {
    it('refuses through the access-denial shape rather than counting when no principal was resolved yet', async () => {
      // `WarehouseAccessGuard` attaches `request.access` only once authority is resolved. A request
      // that reaches this guard with no `request.access` proves the guards ran out of the ADR 0003
      // order — SessionAuthGuard, then WarehouseAccessGuard, then this guard — so this guard must
      // refuse via the same non-enumerating access denial rather than ever incrementing a counter
      // for an actor authorization never approved.
      const clock = jest.fn().mockReturnValue(0);
      const guard = new WriteRateLimitGuard(
        reflectorReturning(true),
        new WriteRateLimitCounter(clock),
      );
      const request = { params: { warehouseId } };

      await expect(guard.canActivate(contextFor(request))).rejects.toEqual(
        expect.objectContaining<ApplicationError>({
          code: ErrorCode.ACCESS_DENIED,
        }),
      );
    });
  });

  describe('non-enumerating refusal', () => {
    it('discloses nothing about existing records: the refusal carries only the stable rate-limit code, no member, warehouse, or count', async () => {
      const now = 0;
      const clock = () => now;
      const guard = new WriteRateLimitGuard(
        reflectorReturning(true),
        new WriteRateLimitCounter(clock),
      );
      const request = resolvedRequest();

      for (let i = 0; i < 60; i += 1) {
        await guard.canActivate(contextFor(request));
      }

      let refusal: ApplicationError | undefined;
      try {
        await guard.canActivate(contextFor(request));
      } catch (error) {
        refusal = error as ApplicationError;
      }

      expect(refusal).toBeInstanceOf(ApplicationError);
      expect(refusal?.code).toBe(ErrorCode.ACCESS_WRITE_RATE_LIMITED);
      expect(refusal?.details).toBeUndefined();
    });
  });
});
