const REQUIRED_DURATION_SECONDS = 600;
const REQUIRED_THROUGHPUT = 30;
const LATENCY_LIMITS_MS = {
  creation: 400,
  deletion: 500,
  emailChange: 300,
  passwordChange: 300,
};

const percentile95 = (values, label) => {
  if (values.length === 0) {
    throw new Error(`${label} requires at least one duration sample`);
  }
  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

export const evaluateLatencySamples = (samples) => {
  const creationP95Ms = percentile95(samples.creation, 'creation p95');
  const deletionP95Ms = percentile95(samples.deletion, 'deletion p95');
  const emailChangeP95Ms = percentile95(samples.emailChange, 'emailChange p95');
  const passwordChangeP95Ms = percentile95(
    samples.passwordChange,
    'passwordChange p95',
  );
  const results = {
    creationP95Ms,
    deletionP95Ms,
    emailChangeP95Ms,
    passwordChangeP95Ms,
  };

  for (const [operation, limit] of Object.entries(LATENCY_LIMITS_MS)) {
    const measured = results[`${operation}P95Ms`];
    if (measured > limit) {
      throw new Error(`${operation} p95 ${measured}ms exceeds ${limit}ms`);
    }
  }

  return results;
};

export const evaluateUsersLoad = (outcomes, durationSeconds) => {
  if (durationSeconds < REQUIRED_DURATION_SECONDS) {
    throw new Error('users load smoke must run for at least 600 seconds');
  }
  if (outcomes.some(({ terminal }) => !terminal)) {
    throw new Error('every lifecycle operation must reach a terminal outcome');
  }

  const throughputPerSecond = outcomes.length / durationSeconds;
  if (throughputPerSecond < REQUIRED_THROUGHPUT) {
    throw new Error(
      `throughput ${throughputPerSecond} is below 30 operations/second`,
    );
  }
  const p95Ms = percentile95(
    outcomes.map(({ durationMs }) => durationMs),
    'users load smoke',
  );

  return { durationSeconds, p95Ms, throughputPerSecond };
};
