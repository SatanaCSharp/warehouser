import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  auditAtomicOutcomes,
  evaluateAccessLoad,
  evaluateLatencySamples,
} from './release-gates.mjs';

test('accepts a ten-minute access load only at the required throughput', () => {
  const outcomes = Array.from({ length: 30_000 }, (_, index) => ({
    durationMs: index % 100 === 0 ? 49 : 12,
    operation: 'authorization',
    terminal: true,
  }));

  assert.deepEqual(evaluateAccessLoad(outcomes, 600), {
    durationSeconds: 600,
    p95Ms: 12,
    throughputPerSecond: 50,
  });
  assert.throws(
    () => evaluateAccessLoad(outcomes.slice(0, -1), 600),
    /throughput .* is below 50 operations\/second/u,
  );
});

test('enforces authorization, read, and mutation p95 thresholds', () => {
  const samples = {
    authorization: [10, 20, 49],
    mutation: [120, 300, 499],
    read: [80, 120, 249],
  };

  assert.deepEqual(evaluateLatencySamples(samples), {
    authorizationP95Ms: 49,
    mutationP95Ms: 499,
    readP95Ms: 249,
  });
  assert.throws(
    () => evaluateLatencySamples({ ...samples, authorization: [51] }),
    /authorization p95 51ms exceeds 50ms/u,
  );
});

test('reports every partial atomic workflow outcome', () => {
  assert.deepEqual(
    auditAtomicOutcomes([
      { committed: true, operation: 'registration', writes: 6 },
      { committed: false, operation: 'role-deletion', writes: 0 },
      { committed: false, operation: 'manager-transfer', writes: 1 },
    ]),
    [{ operation: 'manager-transfer', writes: 1 }],
  );
});
