import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { accessDeniedError } from 'shared/access/access-denial.errors';
import type { WarehouseAccessRequest } from 'shared/access/access-request';
import { WRITE_RATE_LIMITED_KEY } from 'shared/guards/write-rate-limited.decorator';

const windowMs = 60_000;
const maxRecordedChangesPerWindow = 60;

/** Raised when a member's recorded changes exceed `maxRecordedChangesPerWindow` within the current
 * fixed window. Carries no details: the non-disclosure requirement (`spec.md` §6.1) means the
 * refusal must reveal nothing member-, warehouse- or count-specific. */
const writeRateLimitedError = (): ApplicationError =>
  new ApplicationError(ErrorCode.ACCESS_WRITE_RATE_LIMITED);

/** ADR 0003: a hand-rolled, per-instance, fixed-window counter that caps recorded changes —
 * recording demand, creating drafts and adjusting On-hand Quantity — at
 * `maxRecordedChangesPerWindow` per rolling-instance minute, per acting member. Mutating handlers
 * opt in with `@WriteRateLimited()`. Composed **after** `SessionAuthGuard` and
 * `WarehouseAccessGuard` so an unauthorized actor is refused by those guards, never by this one:
 * that ordering is what makes the refusal non-enumerating rather than the error message alone. */
@Injectable()
export class WriteRateLimitGuard implements CanActivate {
  /** Counts for the member currently in `currentWindow` only. Advancing the window discards every
   * prior entry (`resetForWindow`) so memory stays bounded by the distinct members acting within
   * one window, per ADR 0003 §Consequences/Neutral, rather than growing for the process lifetime. */
  private countsByMember = new Map<string, number>();
  private currentWindow: number | undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly now: () => number = Date.now,
  ) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    const limited = this.reflector.getAllAndOverride<boolean>(
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

    const window = Math.floor(this.now() / windowMs);
    if (window !== this.currentWindow) {
      this.countsByMember = new Map<string, number>();
      this.currentWindow = window;
    }

    const count = this.countsByMember.get(userId) ?? 0;
    if (count >= maxRecordedChangesPerWindow) {
      return Promise.reject(writeRateLimitedError());
    }

    this.countsByMember.set(userId, count + 1);
    return Promise.resolve(true);
  }
}
