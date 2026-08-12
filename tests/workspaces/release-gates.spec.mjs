import assert from 'node:assert/strict';
import { test } from 'node:test';

// T31 (docs/features/workspaces/tasks/workspace-load-smoke-test.md) — the
// deterministic half of the Workspace load smoke gate, mirroring the
// `users-management` precedent (tests/users/release-gates.mjs): a human or
// CI feeds captured evidence from a release-like 600-second load run to
// these evaluators. `release-gates.mjs` does not exist yet, so every
// assertion below fails at import time until it is implemented — that is
// the RED step for T31's machine-checkable half (spec.md §6, five p95
// targets plus the throughput target and the Warehouse-authorization
// membership-count independence property).
import {
  evaluateLatencySamples,
  evaluateWarehouseAuthorizationIndependence,
  evaluateWorkspaceLoad,
} from './release-gates.mjs';

test('accepts a ten-minute Workspace load only at the required throughput', () => {
  const outcomes = Array.from({ length: 30_000 }, (_, index) => ({
    durationMs: index % 100 === 0 ? 49 : 12,
    operation: 'workspaceAuthorization',
    terminal: true,
  }));

  assert.deepEqual(evaluateWorkspaceLoad(outcomes, 600), {
    durationSeconds: 600,
    p95Ms: 12,
    throughputPerSecond: 50,
  });
  assert.throws(
    () => evaluateWorkspaceLoad(outcomes.slice(0, -1), 600),
    /throughput .* is below 50 operations\/second/u,
  );
  assert.throws(
    () => evaluateWorkspaceLoad(outcomes, 599),
    /workspaces load smoke must run for at least 600 seconds/u,
  );
  assert.throws(
    () =>
      evaluateWorkspaceLoad(
        outcomes.map((outcome, index) =>
          index === 0 ? { ...outcome, terminal: false } : outcome,
        ),
        600,
      ),
    /every Workspace operation must reach a terminal outcome/u,
  );
});

test('enforces the five distinct Workspace p95 thresholds from spec.md §6', () => {
  const samples = {
    workspaceAuthorization: [10, 20, 49],
    warehouseAuthorization: [5, 15, 48],
    read: [80, 120, 249],
    mutation: [120, 300, 499],
    warehouseSelection: [90, 130, 249],
  };

  assert.deepEqual(evaluateLatencySamples(samples), {
    workspaceAuthorizationP95Ms: 49,
    warehouseAuthorizationP95Ms: 48,
    readP95Ms: 249,
    mutationP95Ms: 499,
    warehouseSelectionP95Ms: 249,
  });

  assert.throws(
    () =>
      evaluateLatencySamples({ ...samples, workspaceAuthorization: [51] }),
    /workspaceAuthorization p95 51ms exceeds 50ms/u,
  );
  assert.throws(
    () =>
      evaluateLatencySamples({ ...samples, warehouseAuthorization: [51] }),
    /warehouseAuthorization p95 51ms exceeds 50ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, read: [251] }),
    /read p95 251ms exceeds 250ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, mutation: [501] }),
    /mutation p95 501ms exceeds 500ms/u,
  );
  assert.throws(
    () => evaluateLatencySamples({ ...samples, warehouseSelection: [251] }),
    /warehouseSelection p95 251ms exceeds 250ms/u,
  );
});

test('proves the Warehouse authorization stage does not grow with membership count', () => {
  const lowMembershipSamples = [10, 12, 15, 18, 20];
  const withinNoiseHighMembershipSamples = [11, 13, 16, 19, 22];

  assert.deepEqual(
    evaluateWarehouseAuthorizationIndependence(
      lowMembershipSamples,
      withinNoiseHighMembershipSamples,
    ),
    { lowP95Ms: 20, highP95Ms: 22, driftMs: 2 },
  );

  const growingHighMembershipSamples = [40, 42, 44, 46, 49];
  assert.throws(
    () =>
      evaluateWarehouseAuthorizationIndependence(
        lowMembershipSamples,
        growingHighMembershipSamples,
      ),
    /warehouse authorization p95 grew by 29ms between 1 and ~50 memberships, exceeding the 5ms noise tolerance/u,
  );

  const overLimitSamples = [51, 52, 53, 54, 55];
  assert.throws(
    () =>
      evaluateWarehouseAuthorizationIndependence(
        lowMembershipSamples,
        overLimitSamples,
      ),
    /warehouse authorization p95 \(high-membership\) 55ms exceeds 50ms/u,
  );
});
