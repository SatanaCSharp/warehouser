import { randomUUID } from 'node:crypto';

import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import { AuthRegistrationService } from 'auth/domain/services/auth-registration.service';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

const buildIdentity = (email = `${randomUUID()}@example.test`) => {
  const id = randomUUID();
  const account = Account.create({
    id,
    email,
    credential: {
      algorithm: 'scrypt',
      hash: 'synthetic-hash',
      parameters: { cost: 1_024, salt: 'synthetic-salt' },
    },
  });
  const user = User.forAccount(account);
  const session = Session.establish({
    id: SessionId.create(randomUUID()),
    accountId: account.id,
    digest: SessionDigest.create(Buffer.alloc(32, 1)),
    establishedAt: new Date('2026-07-25T10:00:00.000Z'),
  });
  return { account, user, session };
};

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('AuthRegistrationService', () => {
  const transactionContext = new DbTransactionContext(dataSource);
  const transactionService = new DbTransactionService(
    dataSource,
    transactionContext,
  );
  const authenticationRepository = new AuthenticationRepository(dataSource);
  const registrationService = new AuthRegistrationService(
    authenticationRepository,
  );
  const registerIdentity = (
    identity: ReturnType<typeof buildIdentity>,
  ): Promise<void> =>
    transactionService.executeInTransaction({}, () =>
      registrationService.registerIdentity(identity),
    );

  beforeAll(async () => {
    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query('TRUNCATE sessions, users, accounts CASCADE');
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('atomically persists one linked Account, User, and Session', async () => {
    const identity = buildIdentity();

    await registerIdentity(identity);

    const rows = await dataSource.query(
      'SELECT (SELECT count(*) FROM accounts) AS accounts, ' +
        '(SELECT count(*) FROM users) AS users, ' +
        '(SELECT count(*) FROM sessions) AS sessions',
    );
    expect(rows[0]).toMatchObject({ accounts: '1', users: '1', sessions: '1' });
  });

  it('lets the database choose one winner for concurrent normalized emails', async () => {
    const email = 'duplicate@example.test';
    const results = await Promise.allSettled([
      registerIdentity(buildIdentity(email)),
      registerIdentity(buildIdentity(email)),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      await dataSource.query('SELECT count(*) AS count FROM accounts'),
    ).toEqual([{ count: '1' }]);
  });

  it('resolves valid sessions and revokes them idempotently', async () => {
    const identity = buildIdentity();
    await registerIdentity(identity);

    await expect(
      authenticationRepository.findValidSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.not.toBeNull();
    await expect(
      authenticationRepository.revokeSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      authenticationRepository.revokeSessionByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(false);
  });
});
