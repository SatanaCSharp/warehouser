import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  AuthRegistrationService,
  RegisteredIdentity,
} from 'auth/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { PasswordHasher } from 'auth/utils/node-scrypt-password-hasher';
import { GeneratedSessionSecret } from 'auth/utils/opaque-session-secrets';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { AccountRepository } from 'shared/domain/repositories/account.repository';

const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';

interface RepositoryFake {
  found: AccountEntity | null;
  registered?: RegisteredIdentity;
  failure?: Error;
  findByNormalizedEmail(): Promise<AccountEntity | null>;
  registerIdentity(identity: RegisteredIdentity): Promise<void>;
}

const createRepositoryFake = (): RepositoryFake => ({
  found: null,
  findByNormalizedEmail() {
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

interface HasherFake {
  received?: string;
  hash(password: string): Promise<{
    algorithm: string;
    hash: string;
    parameters: { cost: number };
  }>;
}

const createHasherFake = (): HasherFake => ({
  hash(password) {
    this.received = password;
    return Promise.resolve({
      algorithm: 'scrypt',
      hash: 'hash',
      parameters: { cost: 1_024 },
    });
  },
});

const generateSecret = (): GeneratedSessionSecret => ({
  secret: 'opaque-secret',
  digest: Buffer.alloc(32, 1),
});

const setup = () => {
  const repository = createRepositoryFake();
  const hasher = createHasherFake();
  const command = new RegisterCommand(
    repository as unknown as AccountRepository,
    repository as unknown as AuthRegistrationService,
    hasher as PasswordHasher,
    generateSecret,
    {
      now: () => new Date('2026-07-25T10:00:00.000Z'),
      identityId: () => identityId,
      sessionId: () => sessionId,
    },
  );
  return { repository, hasher, command };
};

describe('RegisterCommand', () => {
  it('creates one linked identity and initial persistent session', async () => {
    const { command, repository, hasher } = setup();
    const password = '  exact password  ';

    await expect(
      command.execute({ email: ' Person@Example.TEST ', password }),
    ).resolves.toEqual({
      userId: identityId,
      sessionSecret: 'opaque-secret',
      expiresAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    expect(hasher.received).toBe(password);
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
