import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

/** Raised when a member's recorded changes exceed the window's allowance. Carries no details: the
 * non-disclosure requirement (`spec.md` §6.1) means the refusal must reveal nothing member-,
 * warehouse- or count-specific. */
const writeRateLimitedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_WRITE_RATE_LIMITED);

/** ADR 0003: caps recorded changes — recording demand, creating drafts and adjusting On-hand
 * Quantity — per acting member per minute. Mutating handlers opt in with `@WriteRateLimited()`.
 * Composed **after** `SessionAuthGuard` and `WarehouseAccessGuard` so an unauthorized actor is
 * refused by those guards, never by this one: that ordering is what makes the refusal
 * non-enumerating rather than the error message alone.
 *
 * Declared per route rather than with `APP_GUARD`, because Nest runs global guards *before*
 * controller- and route-scoped ones, which would invert that required order and reject every write
 * before `request.access` exists. The counting state lives in `WriteRateLimitCounter` because Nest
 * instantiates this guard once per module that uses it. */
@Injectable()
export class WriteRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly counter: WriteRateLimitCounter,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const limited = this.reflector.getAllAndOverride<boolean | undefined>(
      WRITE_RATE_LIMITED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!limited) {
      return Promise.resolve(true);
    }

    const request = context.switchToHttp().getRequest<WarehouseAccessRequest>();
    const userId = request.access?.userId;
    if (!userId) {
      return Promise.reject(accessDeniedError());
    }

    if (!this.counter.tryRecord(userId)) {
      return Promise.reject(writeRateLimitedError());
    }

    return Promise.resolve(true);
  }
}
