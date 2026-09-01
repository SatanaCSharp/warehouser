import { SetMetadata } from '@nestjs/common';

/** Declares that a mutating handler is subject to `WriteRateLimitGuard`'s per-member per-minute
 * counter (ADR 0003, `spec.md` §6.1 "Draft and demand spam"). Absence of this declaration is the
 * default: the guard lets an undeclared handler through uncounted. */
export const WRITE_RATE_LIMITED_KEY = 'access.write-rate-limited';

export const WriteRateLimited = () => SetMetadata(WRITE_RATE_LIMITED_KEY, true);
