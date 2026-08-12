const REQUIRED_DURATION_SECONDS = 600;
const REQUIRED_THROUGHPUT = 50;
const LATENCY_LIMITS_MS = {
  workspaceAuthorization: 50,
  warehouseAuthorization: 50,
  read: 250,
  mutation: 500,
  warehouseSelection: 250,
};
const WAREHOUSE_AUTHORIZATION_NOISE_TOLERANCE_MS = 5;

const percentile95 = (values, label) => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one duration sample`);
  }
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

export const evaluateLatencySamples = (samples) => {
  const workspaceAuthorizationP95Ms = percentile95(
    samples.workspaceAuthorization,
    'workspaceAuthorization p95',
  );
  const warehouseAuthorizationP95Ms = percentile95(
    samples.warehouseAuthorization,
    'warehouseAuthorization p95',
  );
  const readP95Ms = percentile95(samples.read, 'read p95');
  const mutationP95Ms = percentile95(samples.mutation, 'mutation p95');
  const warehouseSelectionP95Ms = percentile95(
    samples.warehouseSelection,
    'warehouseSelection p95',
  );
  const results = {
    workspaceAuthorizationP95Ms,
    warehouseAuthorizationP95Ms,
    readP95Ms,
    mutationP95Ms,
    warehouseSelectionP95Ms,
  };

  for (const [operation, limit] of Object.entries(LATENCY_LIMITS_MS)) {
    const measured = results[`${operation}P95Ms`];
    if (measured > limit) {
      throw new Error(`${operation} p95 ${measured}ms exceeds ${limit}ms`);
    }
  }

  return results;
};

export const evaluateWorkspaceLoad = (outcomes, durationSeconds) => {
  if (durationSeconds < REQUIRED_DURATION_SECONDS) {
    throw new Error('workspaces load smoke must run for at least 600 seconds');
  }
  if (outcomes.some(({ terminal }) => !terminal)) {
    throw new Error('every Workspace operation must reach a terminal outcome');
  }

  const throughputPerSecond = outcomes.length / durationSeconds;
  if (throughputPerSecond < REQUIRED_THROUGHPUT) {
    throw new Error(
      `throughput ${throughputPerSecond} is below 50 operations/second`,
    );
  }
  const p95Ms = percentile95(
    outcomes.map(({ durationMs }) => durationMs),
    'workspaces load smoke',
  );

  return { durationSeconds, p95Ms, throughputPerSecond };
};

export const evaluateWarehouseAuthorizationIndependence = (
  lowMembershipSamples,
  highMembershipSamples,
) => {
  const lowP95Ms = percentile95(
    lowMembershipSamples,
    'warehouse authorization p95 (low-membership)',
  );
  const highP95Ms = percentile95(
    highMembershipSamples,
    'warehouse authorization p95 (high-membership)',
  );

  if (highP95Ms > LATENCY_LIMITS_MS.warehouseAuthorization) {
    throw new Error(
      `warehouse authorization p95 (high-membership) ${highP95Ms}ms exceeds ${LATENCY_LIMITS_MS.warehouseAuthorization}ms`,
    );
  }

  const driftMs = highP95Ms - lowP95Ms;
  if (driftMs > WAREHOUSE_AUTHORIZATION_NOISE_TOLERANCE_MS) {
    throw new Error(
      `warehouse authorization p95 grew by ${driftMs}ms between 1 and ~50 memberships, exceeding the ${WAREHOUSE_AUTHORIZATION_NOISE_TOLERANCE_MS}ms noise tolerance`,
    );
  }

  return { lowP95Ms, highP95Ms, driftMs };
};
