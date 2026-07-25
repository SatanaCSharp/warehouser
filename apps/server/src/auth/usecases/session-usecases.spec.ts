import { Account, SessionRepository } from 'auth/domain';
import {
  AuthInvalidCredentialsError,
  AuthSessionUnavailableError,
  AuthSignOutUnavailableError,
} from 'auth/errors';
import { PasswordHasher } from 'auth/services/password-hasher';
import { SessionSecrets } from 'auth/services/session-secrets';
import { SignInCommand } from 'auth/usecases/commands/sign-in';
import { SignOutCommand } from 'auth/usecases/commands/sign-out';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session';

const account = Account.create({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.test',
  credential: {
    algorithm: 'scrypt',
    hash: 'hash',
    parameters: { cost: 1_024 },
  },
});

describe('auth session use cases', () => {
  it('uses one generic failure and dummy verification for unknown accounts', async () => {
    let dummyVerified = false;
    const command = new SignInCommand(
      { findByNormalizedEmail: () => Promise.resolve(null) },
      {
        hash: jest.fn(),
        verify: jest.fn(),
        dummyVerify: () => {
          dummyVerified = true;
          return Promise.resolve();
        },
        needsUpgrade: jest.fn(),
      },
      { create: jest.fn() } as unknown as SessionRepository,
      {
        generate: () => ({ secret: 'secret', digest: Buffer.alloc(32, 1) }),
      } as SessionSecrets,
      { now: () => new Date('2026-07-25T10:00:00.000Z') },
      {
        identityId: jest.fn(),
        sessionId: () => '00000000-0000-4000-8000-000000000002',
      },
    );

    await expect(
      command.execute({ email: 'missing@example.test', password: 'password' }),
    ).rejects.toBeInstanceOf(AuthInvalidCredentialsError);
    expect(dummyVerified).toBe(true);
  });

  it('establishes a durable session only after valid credentials', async () => {
    const sessions = { create: jest.fn().mockResolvedValue(undefined) };
    const command = new SignInCommand(
      { findByNormalizedEmail: () => Promise.resolve(account) },
      { verify: () => Promise.resolve(true) } as PasswordHasher,
      sessions as unknown as SessionRepository,
      {
        generate: () => ({ secret: 'secret', digest: Buffer.alloc(32, 1) }),
      } as SessionSecrets,
      { now: () => new Date('2026-07-25T10:00:00.000Z') },
      {
        identityId: jest.fn(),
        sessionId: () => '00000000-0000-4000-8000-000000000002',
      },
    );

    await expect(
      command.execute({ email: 'person@example.test', password: 'password' }),
    ).resolves.toMatchObject({
      userId: account.id.value,
      sessionSecret: 'secret',
    });
    expect(sessions.create).toHaveBeenCalledTimes(1);
  });

  it('withholds access when session persistence fails', async () => {
    const command = new SignInCommand(
      { findByNormalizedEmail: () => Promise.resolve(account) },
      { verify: () => Promise.resolve(true) } as PasswordHasher,
      { create: () => Promise.reject(new Error('db')) } as SessionRepository,
      {
        generate: () => ({ secret: 'secret', digest: Buffer.alloc(32, 1) }),
      } as SessionSecrets,
      { now: () => new Date('2026-07-25T10:00:00.000Z') },
      {
        identityId: jest.fn(),
        sessionId: () => '00000000-0000-4000-8000-000000000002',
      },
    );

    await expect(
      command.execute({ email: 'person@example.test', password: 'password' }),
    ).rejects.toBeInstanceOf(AuthSessionUnavailableError);
  });

  it('restores identity only and signs out idempotently', async () => {
    const repository = {
      findValidByDigest: jest.fn().mockResolvedValue({
        accountId: account.id,
      }),
      revokeByDigest: jest.fn().mockResolvedValue(false),
    } as unknown as SessionRepository;
    const secrets = {
      digest: () => Buffer.alloc(32, 1),
    } as SessionSecrets;

    await expect(
      new CurrentSessionQuery(repository, secrets, {
        now: () => new Date('2026-07-25T10:00:00.000Z'),
      }).execute('secret'),
    ).resolves.toEqual({ userId: account.id.value });
    await expect(
      new SignOutCommand(repository, secrets, {
        now: () => new Date('2026-07-25T10:00:00.000Z'),
      }).execute('secret'),
    ).resolves.toBeUndefined();

    repository.revokeByDigest = jest.fn().mockRejectedValue(new Error('db'));
    await expect(
      new SignOutCommand(repository, secrets, {
        now: () => new Date('2026-07-25T10:00:00.000Z'),
      }).execute('secret'),
    ).rejects.toBeInstanceOf(AuthSignOutUnavailableError);
  });
});
