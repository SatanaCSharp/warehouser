const REQUIRED_THROUGHPUT = 20;
const REQUIRED_AVAILABILITY = 0.999;
const MAX_P95_MS = 500;

const percentile95 = (values) => {
  if (values.length === 0) {
    throw new Error('load smoke requires both sign-up and sign-in outcomes');
  }

  const ordered = values.toSorted((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
};

const percentage = (value) => `${(value * 100).toFixed(3)}%`;

export const evaluateLoadSmoke = (outcomes, durationSeconds) => {
  if (durationSeconds <= 0 || outcomes.length === 0) {
    throw new Error('load smoke requires outcomes and a positive duration');
  }

  const signUp = outcomes.filter(({ action }) => action === 'sign-up');
  const signIn = outcomes.filter(({ action }) => action === 'sign-in');
  if (signUp.length !== signIn.length) {
    throw new Error('load smoke must use an even sign-up/sign-in mix');
  }

  const availability =
    outcomes.filter(({ terminal }) => terminal).length / outcomes.length;
  if (availability < REQUIRED_AVAILABILITY) {
    throw new Error(
      `availability ${percentage(availability)} is below 99.9%`,
    );
  }

  const throughputPerSecond = outcomes.length / durationSeconds;
  if (throughputPerSecond < REQUIRED_THROUGHPUT) {
    throw new Error(
      `throughput ${throughputPerSecond} is below 20 outcomes/second`,
    );
  }

  const signUpP95Ms = percentile95(signUp.map(({ durationMs }) => durationMs));
  const signInP95Ms = percentile95(signIn.map(({ durationMs }) => durationMs));
  if (signUpP95Ms > MAX_P95_MS || signInP95Ms > MAX_P95_MS) {
    throw new Error(
      `latency exceeds 500ms: sign-up=${signUpP95Ms}ms sign-in=${signInP95Ms}ms`,
    );
  }

  return {
    availability,
    durationSeconds,
    signInP95Ms,
    signUpP95Ms,
    throughputPerSecond,
  };
};

export const auditIdentityIntegrity = (accounts, users) => {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const accountsById = new Map(
    accounts.map((account) => [account.id, account]),
  );

  return {
    orphanAccounts: accounts
      .filter((account) => {
        const user = usersById.get(account.userId);
        return user?.accountId !== account.id;
      })
      .map(({ id }) => id),
    orphanUsers: users
      .filter((user) => {
        const account = accountsById.get(user.accountId);
        return account?.userId !== user.id;
      })
      .map(({ id }) => id),
  };
};

export const auditSecretLeaks = (sources, secrets) =>
  sources.flatMap((source, sourceIndex) =>
    secrets.flatMap((secret, secretIndex) =>
      secret.length > 0 && source.includes(secret)
        ? [{ secretIndex, sourceIndex }]
        : [],
    ),
  );

export const verifyApprovedPreviews = (expectedNames, files) => {
  const invalid = expectedNames.filter((name) => (files.get(name) ?? 0) === 0);
  if (invalid.length > 0) {
    throw new Error(`missing or empty approved previews: ${invalid.join(', ')}`);
  }
};
