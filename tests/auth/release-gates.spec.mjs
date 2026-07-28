import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  auditIdentityIntegrity,
  auditSecretLeaks,
  evaluateLoadSmoke,
  verifyApprovedPreviews,
} from './release-gates.mjs';

test('accepts an even load mix only when every auth target is met', () => {
  const outcomes = Array.from({ length: 12_000 }, (_, index) => ({
    action: index % 2 === 0 ? 'sign-up' : 'sign-in',
    durationMs: index % 100 === 0 ? 499 : 120,
    terminal: true,
  }));

  assert.deepEqual(evaluateLoadSmoke(outcomes, 600), {
    availability: 1,
    durationSeconds: 600,
    signInP95Ms: 120,
    signUpP95Ms: 120,
    throughputPerSecond: 20,
  });
  assert.throws(
    () =>
      evaluateLoadSmoke(
        outcomes.map((outcome, index) =>
          index < 13 ? { ...outcome, terminal: false } : outcome,
        ),
        600,
      ),
    /availability 99\.892% is below 99\.9%/u,
  );
});

test('reports incomplete identity pairs and reusable secret material', () => {
  assert.deepEqual(
    auditIdentityIntegrity(
      [{ id: 'account-1', userId: 'user-1' }],
      [{ id: 'user-1', accountId: 'account-1' }],
    ),
    { orphanAccounts: [], orphanUsers: [] },
  );
  assert.deepEqual(
    auditIdentityIntegrity(
      [{ id: 'account-1', userId: 'missing-user' }],
      [{ id: 'user-1', accountId: 'missing-account' }],
    ),
    {
      orphanAccounts: ['account-1'],
      orphanUsers: ['user-1'],
    },
  );

  assert.deepEqual(
    auditSecretLeaks(
      ['safe structured outcome', 'password=hunter2'],
      ['hunter2', 'opaque-session-value'],
    ),
    [{ secretIndex: 0, sourceIndex: 1 }],
  );
});

test('requires every approved desktop and mobile preview to be non-empty', () => {
  const expected = ['desktop.png', 'mobile.png'];
  const files = new Map([
    ['desktop.png', 42],
    ['mobile.png', 0],
  ]);

  assert.throws(
    () => verifyApprovedPreviews(expected, files),
    /missing or empty approved previews: mobile\.png/u,
  );
  files.set('mobile.png', 42);
  assert.doesNotThrow(() => verifyApprovedPreviews(expected, files));
});
