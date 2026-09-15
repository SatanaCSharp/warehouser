import { ErrorCode } from '@warehouser/shared-types/enums';
import { generateSessionSecret } from 'auth/domain/security/session-secret';
import {
  AuthRegistrationService,
  RegisteredIdentity,
} from 'auth/domain/services/auth-registration.service';
import { RegisterCommand } from 'auth/usecases/commands/register.command';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { hashPassword } from 'shared/domain/security/password-hashing';
import { freezeClockAt } from 'test/doubles/frozen-clock';
import { pinGeneratedUuids } from 'test/doubles/generated-uuid';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceProvisioningService } from 'workspaces/domain/services/workspace-provisioning.service';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();

  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

vi.mock('shared/domain/security/password-hashing', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('shared/domain/security/password-hashing')
    >();

  return { ...actual, hashPassword: vi.fn(actual.hashPassword) };
});

vi.mock('auth/domain/security/session-secret', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('auth/domain/security/session-secret')
    >();

  return {
    ...actual,
    generateSessionSecret: vi.fn(actual.generateSessionSecret),
  };
});

const identityId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000006';

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

const setup = () => {
  const repository = createRepositoryFake();
  const provisioning = {
    provisionRegistration: vi.fn().mockResolvedValue({
      workspace: { id: '00000000-0000-4000-8000-000000000005', name: null },
      workspacePermissionIds: ['WORKSPACE:RENAME'],
      access: {
        warehouseId: '00000000-0000-4000-8000-000000000003',
        roleId: '00000000-0000-4000-8000-000000000004',
        roleKind: 'warehouse_manager' as const,
        permissionIds: ['ROLES:WATCH'],
      },
    }),
  };
  const command = new RegisterCommand(
    repository as unknown as AuthenticationRepository,
    repository as unknown as AuthRegistrationService,
    provisioning as unknown as WorkspaceProvisioningService,
  );
  return { repository, provisioning, command };
};

freezeClockAt(new Date('2026-07-25T10:00:00.000Z'));
pinGeneratedUuids(identityId, sessionId, workspaceId);

describe('RegisterCommand', () => {
  beforeEach(() => {
    vi.mocked(hashPassword).mockResolvedValue({
      algorithm: 'scrypt',
      hash: 'hash',
      parameters: { cost: 1_024 },
    });
    vi.mocked(generateSessionSecret).mockReturnValue({
      secret: 'opaque-secret',
      digest: Buffer.alloc(32, 1),
    });
  });

  it('creates one linked identity and initial persistent session', async () => {
    const { command, repository, provisioning } = setup();
    const password = '  exact password  ';

    await expect(
      command.execute({
        email: ' Person@Example.TEST ',
        password,
        warehouseName: 'Склад',
      }),
    ).resolves.toEqual({
      userId: identityId,
      sessionSecret: 'opaque-secret',
      expiresAt: new Date('2026-08-24T10:00:00.000Z'),
      workspace: { id: '00000000-0000-4000-8000-000000000005', name: null },
      workspacePermissionIds: ['WORKSPACE:RENAME'],
      access: {
        warehouseId: '00000000-0000-4000-8000-000000000003',
        roleId: '00000000-0000-4000-8000-000000000004',
        roleKind: 'warehouse_manager',
        permissionIds: ['ROLES:WATCH'],
      },
    });
    expect(hashPassword).toHaveBeenCalledWith(password);
    expect(repository.registered?.account.id.value).toBe(identityId);
    expect(repository.registered?.user.id.value).toBe(identityId);
    expect(repository.registered?.workspaceId).toBe(workspaceId);
    expect(provisioning.provisionRegistration).toHaveBeenCalledWith({
      userId: identityId,
      workspaceId,
      warehouseName: 'Склад',
    });
  });

  it('rejects invalid credentials before persistence', async () => {
    const { command, repository } = setup();

    await expect(
      command.execute({
        email: 'invalid',
        password: 'short',
        warehouseName: 'Склад',
      }),
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
        warehouseName: 'Склад',
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
        warehouseName: 'Склад',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.AUTH_REGISTRATION_UNAVAILABLE,
      cause: repository.failure,
    });
  });
});
