const REQUIRED_DURATION_SECONDS = 600;
const REQUIRED_THROUGHPUT = 50;
const LATENCY_LIMITS_MS = {
  authorization: 50,
  read: 250,
  mutation: 500,
};

const percentile95 = (values, label) => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one duration sample`);
  }
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

export const evaluateLatencySamples = (samples) => {
  const authorizationP95Ms = percentile95(
    samples.authorization,
    'authorization p95',
  );
  const readP95Ms = percentile95(samples.read, 'read p95');
  const mutationP95Ms = percentile95(samples.mutation, 'mutation p95');
  const results = { authorizationP95Ms, mutationP95Ms, readP95Ms };

  for (const [operation, limit] of Object.entries(LATENCY_LIMITS_MS)) {
    const measured = results[`${operation}P95Ms`];
    if (measured > limit) {
      throw new Error(`${operation} p95 ${measured}ms exceeds ${limit}ms`);
    }
  }

  return results;
};

export const evaluateAccessLoad = (outcomes, durationSeconds) => {
  if (durationSeconds < REQUIRED_DURATION_SECONDS) {
    throw new Error('access load smoke must run for at least 600 seconds');
  }
  if (outcomes.some(({ terminal }) => !terminal)) {
    throw new Error('every protected operation must reach a terminal outcome');
  }

  const throughputPerSecond = outcomes.length / durationSeconds;
  if (throughputPerSecond < REQUIRED_THROUGHPUT) {
    throw new Error(
      `throughput ${throughputPerSecond} is below 50 operations/second`,
    );
  }
  const p95Ms = percentile95(
    outcomes.map(({ durationMs }) => durationMs),
    'access load smoke',
  );
  if (p95Ms > LATENCY_LIMITS_MS.authorization) {
    throw new Error(`authorization p95 ${p95Ms}ms exceeds 50ms`);
  }

  return { durationSeconds, p95Ms, throughputPerSecond };
};

export const auditAtomicOutcomes = (outcomes) =>
  outcomes
    .filter(({ committed, writes }) => !committed && writes !== 0)
    .map(({ operation, writes }) => ({ operation, writes }));
