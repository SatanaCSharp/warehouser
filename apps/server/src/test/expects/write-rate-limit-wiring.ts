import type { TestingModule } from '@nestjs/testing';
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter.js';
import { WriteRateLimitGuard } from 'shared/guards/write-rate-limit.guard.js';
import { expect } from 'vitest';

interface ContainerModule {
  readonly injectables?: Map<unknown, { instance?: unknown }>;
}

interface WithContainer {
  readonly container: { getModules(): Map<unknown, ContainerModule> };
}

/** Asserts that every `WriteRateLimitGuard` a route will actually run counts into `expected`.
 *
 * `@UseGuards(WriteRateLimitGuard)` makes Nest build the guard as a per-module *injectable*, one
 * per module declaring such a route, so there is no single guard to inspect and `overrideProvider`
 * on the guard class does not reach any of them. This walks the booted container instead and checks
 * the counter each of those instances holds, which is the property both the shared limit and the
 * pinned clock depend on. */
export const expectPinnedCounterOnEveryRouteGuard = (
  moduleRef: TestingModule,
  expected: WriteRateLimitCounter,
): void => {
  const modules = (
    moduleRef as unknown as WithContainer
  ).container.getModules();

  const routeGuards = [...modules.values()]
    .map((module) => module.injectables?.get(WriteRateLimitGuard)?.instance)
    .filter(
      (instance): instance is WriteRateLimitGuard =>
        instance instanceof WriteRateLimitGuard,
    );

  // A zero-length list would make the assertion below vacuously true, which is exactly the failure
  // mode being guarded against: a guard wired to nothing.
  expect(routeGuards.length).toBeGreaterThan(0);
  for (const guard of routeGuards) {
    expect((guard as unknown as { counter: unknown }).counter).toBe(expected);
  }
};
