import { randomUUID } from 'node:crypto';

import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { User } from 'auth/domain/entities/user';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { AuthRegistrationService } from 'auth/services/auth-registration.service';
import dataSource from 'shared/database/data-source';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { DbTransactionContext } from 'shared/database/db-transaction-context.service';
import { AccountRepository } from 'shared/domain/repositories/account.repository';
import { SessionRepository } from 'shared/domain/repositories/session.repository';
import { UserRepository } from 'shared/domain/repositories/user.repository';

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
  const accountRepository = new AccountRepository(dataSource);
  const userRepository = new UserRepository(dataSource);
  const sessionRepository = new SessionRepository(dataSource);
  const registrationService = new AuthRegistrationService(
    accountRepository,
    userRepository,
    sessionRepository,
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
      sessionRepository.findValidByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.not.toBeNull();
    await expect(
      sessionRepository.revokeByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(true);
    await expect(
      sessionRepository.revokeByDigest(
        Buffer.from(identity.session.digest.value),
        new Date('2026-07-26T10:00:00.000Z'),
      ),
    ).resolves.toBe(false);
  });
});
