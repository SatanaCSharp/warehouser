import { ErrorCode } from '@warehouser/shared-types/enums';
import { GeneratedSessionSecret } from 'auth/domain/security/session-secret';
import {
  AuthRegistrationService,
  RegisteredIdentity,
} from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';

const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';

interface RepositoryFake {
  found: AccountEntity | null;
  registered?: RegisteredIdentity;
  failure?: Error;
  findAccountByNormalizedEmail(): Promise<AccountEntity | null>;
  registerIdentity(identity: RegisteredIdentity): Promise<void>;
}

const createRepositoryFake = (): RepositoryFake => ({
  found: null,
  findAccountByNormalizedEmail() {
    return Promise.resolve(this.found);
  },
  registerIdentity(identity) {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    this.registered = identity;
    return Promise.resolve();
  },
});

const createHashFake = () => {
  const hash = jest.fn(() =>
    Promise.resolve({
      algorithm: 'scrypt',
      hash: 'hash',
      parameters: { cost: 1_024 },
    }),
  );
  return hash;
};

const generateSecret = (): GeneratedSessionSecret => ({
  secret: 'opaque-secret',
  digest: Buffer.alloc(32, 1),
});

const setup = () => {
  const repository = createRepositoryFake();
  const hash = createHashFake();
  const command = new RegisterCommand(
    repository as unknown as AuthenticationRepository,
    repository as unknown as AuthRegistrationService,
    hash,
    generateSecret,
    {
      now: () => new Date('2026-07-25T10:00:00.000Z'),
      identityId: () => identityId,
      sessionId: () => sessionId,
    },
  );
  return { repository, hash, command };
};

describe('RegisterCommand', () => {
  it('creates one linked identity and initial persistent session', async () => {
    const { command, repository, hash } = setup();
    const password = '  exact password  ';

    await expect(
      command.execute({ email: ' Person@Example.TEST ', password }),
    ).resolves.toEqual({
      userId: identityId,
      sessionSecret: 'opaque-secret',
      expiresAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    expect(hash).toHaveBeenCalledWith(password);
    expect(repository.registered?.account.id.value).toBe(identityId);
    expect(repository.registered?.user.id.value).toBe(identityId);
  });

  it('rejects invalid credentials before persistence', async () => {
    const { command, repository } = setup();

    await expect(
      command.execute({ email: 'invalid', password: 'short' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });
    expect(repository.registered).toBeUndefined();
  });

  it('rejects an already registered normalized email', async () => {
    const { command, repository } = setup();
    repository.found = {} as AccountEntity;

    await expect(
      command.execute({
        email: 'person@example.test',
        password: 'password',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED,
    });
  });

  it('propagates registration failure without reporting authenticated access', async () => {
    const { command, repository } = setup();
    repository.failure = new Error('transaction rolled back');

    await expect(
      command.execute({
        email: 'person@example.test',
        password: 'password',
      }),
    ).rejects.toThrow('transaction rolled back');
  });
});
