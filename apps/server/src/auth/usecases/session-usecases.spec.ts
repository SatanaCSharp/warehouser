import { ErrorCode } from '@warehouser/shared-types/enums';
import { SystemError } from '@warehouser/shared-types/errors';
import { AuthRuntime } from 'auth/domain/auth-runtime';
import { Account } from 'auth/domain/entities/account';
import { Session } from 'auth/domain/entities/session';
import { toAccountEntity } from 'auth/domain/mappers/account.mapper';
import { toSessionEntity } from 'auth/domain/mappers/session.mapper';
import { GeneratedSessionSecret } from 'auth/domain/security/session-secret';
import { SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';
import { SignInCommand } from 'auth/usecases/commands/sign-in.command';
import { SignOutCommand } from 'auth/usecases/commands/sign-out.command';
import { CurrentSessionQuery } from 'auth/usecases/queries/current-session.query';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

const account = Account.create({
  id: '00000000-0000-4000-8000-000000000001',
  email: 'person@example.test',
  credential: {
    algorithm: 'scrypt',
    hash: 'hash',
    parameters: { cost: 1_024 },
  },
});

const runtime = {
  now: () => new Date('2026-07-25T10:00:00.000Z'),
  identityId: jest.fn(),
  sessionId: () => '00000000-0000-4000-8000-000000000002',
} as AuthRuntime;

const generateSecret = (): GeneratedSessionSecret => ({
  secret: 'secret',
  digest: Buffer.alloc(32, 1),
});
const digestSecret = (): Buffer => Buffer.alloc(32, 1);
const accountEntity = toAccountEntity(
  account,
  new Date('2026-07-25T10:00:00.000Z'),
);

describe('auth session use cases', () => {
  it('uses one generic failure and dummy verification for unknown accounts', async () => {
    let dummyVerified = false;
    const command = new SignInCommand(
      {
        findAccountByNormalizedEmail: () => Promise.resolve(null),
        createSession: jest.fn(),
      } as unknown as AuthenticationRepository,
      jest.fn(),
      () => {
        dummyVerified = true;
        return Promise.resolve();
      },
      generateSecret,
      runtime,
    );

    await expect(
      command.execute({ email: 'missing@example.test', password: 'password' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_CREDENTIALS });
    expect(dummyVerified).toBe(true);
  });

  it('establishes a durable session only after valid credentials', async () => {
    const repository = {
      findAccountByNormalizedEmail: () => Promise.resolve(accountEntity),
      createSession: jest.fn().mockResolvedValue(undefined),
    };
    const command = new SignInCommand(
      repository as unknown as AuthenticationRepository,
      () => Promise.resolve(true),
      jest.fn(),
      generateSecret,
      runtime,
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
    const command = new SignInCommand(
      {
        findAccountByNormalizedEmail: () => Promise.resolve(accountEntity),
        createSession: () =>
          Promise.reject(
            new SystemError(
              ErrorCode.AUTH_SESSION_UNAVAILABLE,
              new Error('db'),
            ),
          ),
      } as unknown as AuthenticationRepository,
      () => Promise.resolve(true),
      jest.fn(),
      generateSecret,
      runtime,
    );

    await expect(
      command.execute({ email: 'person@example.test', password: 'password' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_SESSION_UNAVAILABLE });
  });

  it('restores identity only and signs out idempotently', async () => {
    const repository = {
      findValidSessionByDigest: jest.fn().mockResolvedValue({
        ...toSessionEntity(
          Session.establish({
            id: SessionId.create('00000000-0000-4000-8000-000000000002'),
            accountId: account.id,
            digest: SessionDigest.create(Buffer.alloc(32, 1)),
            establishedAt: new Date('2026-07-25T10:00:00.000Z'),
          }),
        ),
      }),
      revokeSessionByDigest: jest.fn().mockResolvedValue(false),
    } as unknown as AuthenticationRepository;

    await expect(
      new CurrentSessionQuery(repository, digestSecret, runtime).execute(
        'secret',
      ),
    ).resolves.toEqual({ userId: account.id.value });
    await expect(
      new SignOutCommand(repository, digestSecret, runtime).execute('secret'),
    ).resolves.toBeUndefined();

    repository.revokeSessionByDigest = jest
      .fn()
      .mockRejectedValue(
        new SystemError(ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE, new Error('db')),
      );
    await expect(
      new SignOutCommand(repository, digestSecret, runtime).execute('secret'),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_SIGN_OUT_UNAVAILABLE });
  });
});
