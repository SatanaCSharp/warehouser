import { ErrorCode } from '@warehouser/shared-types/enums';
import { SystemError } from '@warehouser/shared-types/errors';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { toAccountEntity } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import {
  digestSessionSecret,
  generateSessionSecret,
} from 'auth/domain/security/session-secret';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import {
  dummyVerifyPassword,
  verifyPassword,
} from 'shared/domain/security/password-hashing';
import { freezeClockAt } from 'test/doubles/frozen-clock';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Scrypt hashing, secret generation and digesting are the collaborators the sign-in and sign-out
// commands now reach for directly, the way production reaches for them. Controlling them means
// controlling the modules rather than the commands' parameter lists.
vi.mock('shared/domain/security/password-hashing', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('shared/domain/security/password-hashing')
    >();

  return {
    ...actual,
    verifyPassword: vi.fn(actual.verifyPassword),
    dummyVerifyPassword: vi.fn(actual.dummyVerifyPassword),
  };
});

vi.mock('auth/domain/security/session-secret', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('auth/domain/security/session-secret')
    >();

  return {
    ...actual,
    generateSessionSecret: vi.fn(actual.generateSessionSecret),
    digestSessionSecret: vi.fn(actual.digestSessionSecret),
  };
});

const account = Account.create({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.test',
  credential: {
    algorithm: 'scrypt',
    hash: 'hash',
    parameters: { cost: 1_024 },
  },
});

const establishedAt = new Date('2026-07-25T10:00:00.000Z');
const sessionDigest = Buffer.alloc(32, 1);

const accountEntity = toAccountEntity(account, establishedAt);

freezeClockAt(establishedAt);

describe('auth session use cases', () => {
  // Every case below pins what the command mints: one known secret and the digest it hashes to.
  beforeEach(() => {
    vi.mocked(generateSessionSecret).mockReturnValue({
      secret: 'secret',
      digest: sessionDigest,
    });
    vi.mocked(digestSessionSecret).mockReturnValue(sessionDigest);
  });

  it('uses one generic failure and dummy verification for unknown accounts', async () => {
    vi.mocked(dummyVerifyPassword).mockResolvedValue(undefined);
    const command = new SignInCommand({
      findAccountByNormalizedEmail: () => Promise.resolve(null),
      createSession: vi.fn(),
    } as unknown as AuthenticationRepository);

    await expect(
      command.execute({ email: 'missing@example.test', password: 'password' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS });
    expect(dummyVerifyPassword).toHaveBeenCalledTimes(1);
  });

  it('establishes a durable session only after valid credentials', async () => {
    const repository = {
      findAccountByNormalizedEmail: () => Promise.resolve(accountEntity),
      createSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const command = new SignInCommand(
      repository as unknown as AuthenticationRepository,
    );

    await expect(
      command.execute({ email: 'person@example.test', password: 'password' }),
    ).resolves.toMatchObject({
      userId: account.id.value,
      sessionSecret: 'secret',
    });
    expect(repository.createSession).toHaveBeenCalledTimes(1);
  });

  it('withholds access when session persistence fails', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true);
    const command = new SignInCommand({
      findAccountByNormalizedEmail: () => Promise.resolve(accountEntity),
      createSession: () =>
        Promise.reject(
          new SystemError(ErrorCode.AUTH_SESSION_UNAVAILABLE, new Error('db')),
        ),
    } as unknown as AuthenticationRepository);

    await expect(
      command.execute({ email: 'person@example.test', password: 'password' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_SESSION_UNAVAILABLE });
  });

  it('restores identity only and signs out idempotently', async () => {
    const repository = {
      findValidSessionByDigest: vi.fn().mockResolvedValue({
        ...toSessionEntity(
          Session.establish({
            id: SessionId.create('00000000-0000-4000-8000-000000000002'),
            accountId: account.id,
            digest: SessionDigest.create(sessionDigest),
            establishedAt,
          }),
        ),
      }),
      revokeSessionByDigest: vi.fn().mockResolvedValue(false),
    } as unknown as AuthenticationRepository;

    await expect(
      new CurrentSessionQuery(repository).execute('secret'),
    ).resolves.toEqual({ userId: account.id.value });
    await expect(
      new SignOutCommand(repository).execute('secret'),
    ).resolves.toBeUndefined();

    repository.revokeSessionByDigest = vi
      .fn()
      .mockRejectedValue(
        new SystemError(ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE, new Error('db')),
      );
    await expect(
      new SignOutCommand(repository).execute('secret'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE });
  });
});
