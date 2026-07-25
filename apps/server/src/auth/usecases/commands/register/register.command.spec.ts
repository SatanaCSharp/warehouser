import { ErrorCode } from '@warehouser/shared-types/enums';
import {
  AccountRepository,
  AuthRegistrationRepository,
  RegisteredIdentity,
} from 'auth/domain';
import { PasswordHasher } from 'auth/services/password-hasher';
import {
  GeneratedSessionSecret,
  SessionSecrets,
} from 'auth/services/session-secrets';
import { RegisterCommand } from 'auth/usecases/commands/register';

const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';

class AccountsFake extends AccountRepository {
  found = null;
  findByNormalizedEmail() {
    return Promise.resolve(this.found);
  }
}

class RegistrationsFake extends AuthRegistrationRepository {
  registered?: RegisteredIdentity;
  failure?: Error;
  registerIdentity(identity: RegisteredIdentity) {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    this.registered = identity;
    return Promise.resolve();
  }
}

class HasherFake extends PasswordHasher {
  received?: string;
  hash(password: string) {
    this.received = password;
    return Promise.resolve({
      algorithm: 'scrypt',
      hash: 'hash',
      parameters: { cost: 1_024 },
    });
  }
  verify() {
    return Promise.resolve(false);
  }
  dummyVerify() {
    return Promise.resolve();
  }
  needsUpgrade() {
    return false;
  }
}

class SecretsFake extends SessionSecrets {
  generate(): GeneratedSessionSecret {
    return { secret: 'opaque-secret', digest: Buffer.alloc(32, 1) };
  }
  digest() {
    return Buffer.alloc(32, 1);
  }
}

const setup = () => {
  const accounts = new AccountsFake();
  const registrations = new RegistrationsFake();
  const hasher = new HasherFake();
  const command = new RegisterCommand(
    accounts,
    registrations,
    hasher,
    new SecretsFake(),
    { now: () => new Date('2026-07-25T10:00:00.000Z') },
    { identityId: () => identityId, sessionId: () => sessionId },
  );
  return { accounts, registrations, hasher, command };
};

describe('RegisterCommand', () => {
  it('creates one linked identity and initial persistent session', async () => {
    const { command, registrations, hasher } = setup();
    const password = '  exact password  ';

    await expect(
      command.execute({ email: ' Person@Example.TEST ', password }),
    ).resolves.toEqual({
      userId: identityId,
      sessionSecret: 'opaque-secret',
      expiresAt: new Date('2026-08-24T10:00:00.000Z'),
    });
    expect(hasher.received).toBe(password);
    expect(registrations.registered?.account.id.value).toBe(identityId);
    expect(registrations.registered?.user.id.value).toBe(identityId);
  });

  it('rejects invalid credentials before persistence', async () => {
    const { command, registrations } = setup();

    await expect(
      command.execute({ email: 'invalid', password: 'short' }),
    ).rejects.toMatchObject({ code: ErrorCode.AUTH_INVALID_INPUT });
    expect(registrations.registered).toBeUndefined();
  });

  it('rejects an already registered normalized email', async () => {
    const { command, accounts } = setup();
    accounts.found = {} as never;

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
    const { command, registrations } = setup();
    registrations.failure = new Error('transaction rolled back');

    await expect(
      command.execute({
        email: 'person@example.test',
        password: 'password',
      }),
    ).rejects.toThrow('transaction rolled back');
  });
});
