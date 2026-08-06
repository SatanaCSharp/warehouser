import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  evaluateLatencySamples,
  evaluateUsersLoad,
} from './release-gates.mjs';

test('accepts a ten-minute lifecycle load only at the required throughput', () => {
  const outcomes = Array.from({ length: 18_000 }, (_, index) => ({
    durationMs: index % 100 === 0 ? 399 : 120,
    operation: 'creation',
    terminal: true,
  }));

  assert.deepEqual(evaluateUsersLoad(outcomes, 600), {
    durationSeconds: 600,
    p95Ms: 120,
    throughputPerSecond: 30,
  });
  assert.throws(
    () => evaluateUsersLoad(outcomes.slice(0, -1), 600),
    /throughput .* is below 30 operations\/second/u,
  );
  assert.throws(
    () => evaluateUsersLoad(outcomes, 599),
    /users load smoke must run for at least 600 seconds/u,
  );
  assert.throws(
    () =>
      evaluateUsersLoad(
        outcomes.map((outcome, index) =>
          index === 0 ? { ...outcome, terminal: false } : outcome,
        ),
        600,
      ),
    /every lifecycle operation must reach a terminal outcome/u,
  );
});

test('enforces the four distinct lifecycle p95 thresholds from spec.md §6', () => {
  const samples = {
    creation: [100, 200, 400],
    deletion: [200, 300, 500],
    emailChange: [50, 100, 300],
    passwordChange: [50, 150, 300],
  };

  assert.deepEqual(evaluateLatencySamples(samples), {
    creationP95Ms: 400,
    deletionP95Ms: 500,
    emailChangeP95Ms: 300,
    passwordChangeP95Ms: 300,
  });

  assert.throws(
    () => evaluateLatencySamples({ ...samples, creation: [401] }),
    /creation p95 401ms exceeds 400ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, emailChange: [301] }),
    /emailChange p95 301ms exceeds 300ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, passwordChange: [301] }),
    /passwordChange p95 301ms exceeds 300ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, deletion: [501] }),
    /deletion p95 501ms exceeds 500ms/u,
  );
});
