import { Global, Module } from '@nestjs/common';
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter';

/** Provides the one `WriteRateLimitCounter` every `WriteRateLimitGuard` instance counts into.
 *
 * The guard itself is deliberately **not** provided here. Naming a guard class in `@UseGuards(...)`
 * makes Nest create it as a per-module *injectable*, never resolving an exported provider, so a
 * guard registration in this module would be dead weight — that was the earlier mistake this module
 * now corrects. What the guard needs from a shared home is its state, and a provider's dependency
 * *is* resolved through the module injector: `@Global()` here means every per-module guard instance
 * receives this single counter, so ADR 0003's "60 recorded changes per minute per member" is a
 * per-process total rather than a per-REST-module allowance. */
@Global()
@Module({
  providers: [WriteRateLimitCounter],
  exports: [WriteRateLimitCounter],
})
export class WriteRateLimitModule {}
