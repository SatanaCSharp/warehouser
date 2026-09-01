import { Inject, Injectable, Optional } from '@nestjs/common';

/** Injection token for the counter's clock, so the fixed window can be pinned in a test without
 * making the production wiring aware of testing. */
export const WRITE_RATE_LIMIT_CLOCK = 'WRITE_RATE_LIMIT_CLOCK';

const windowMs = 60_000;
const maxRecordedChangesPerWindow = 60;

/** The fixed-window counter behind `WriteRateLimitGuard` (ADR 0003, spec.md §6.1).
 *
 * The state lives here, in a provider, rather than in the guard, because **a guard is not a
 * singleton**. `@UseGuards(WriteRateLimitGuard)` names a class, and Nest's `GuardsContextCreator`
 * resolves it through `moduleRef.injectables`, which `Module.addInjectable` populates with a fresh
 * `InstanceWrapper` for every module that declares a route using it — `@Global()` and `exports` do
 * not change this. Holding the counts in the guard therefore gave each REST module its own tally,
 * so a member got the full 60 writes per module rather than 60 in total, under-enforcing the
 * abuse-case mitigation by a factor of however many modules expose writes.
 *
 * A provider *is* resolved through the module injector, so one `@Global()` instance of this class
 * serves every guard instance and the per-route instancing stops mattering. */
@Injectable()
export class WriteRateLimitCounter {
  /** Counts for the member currently in `currentWindow` only. Advancing the window discards every
   * prior entry so memory stays bounded by the distinct members acting within one window, per
   * ADR 0003 §Consequences/Neutral, rather than growing for the process lifetime. */
  private countsByMember = new Map<string, number>();
  private currentWindow: number | undefined;

  constructor(
    @Optional()
    @Inject(WRITE_RATE_LIMIT_CLOCK)
    private readonly now: () => number = Date.now,
  ) {}

  /** Records one write for `userId` and reports whether it is within the window's allowance.
   * Returns `false` once the member has already recorded `maxRecordedChangesPerWindow` changes in
   * the current window; the caller turns that into the refusal. */
  tryRecord(userId: string): boolean {
    const window = Math.floor(this.now() / windowMs);
    if (window !== this.currentWindow) {
      this.countsByMember = new Map<string, number>();
      this.currentWindow = window;
    }

    const count = this.countsByMember.get(userId) ?? 0;
    if (count >= maxRecordedChangesPerWindow) {
      return false;
    }

    this.countsByMember.set(userId, count + 1);
    return true;
  }
}
