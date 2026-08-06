import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

const now = new Date('2026-08-06T12:00:00.000Z');

const warehouseId = '00000000-0000-4000-8000-000000000101';
const creatorRoleId = '00000000-0000-4000-8000-000000000201';
const targetRoleId = '00000000-0000-4000-8000-000000000202';
const managerRoleId = '00000000-0000-4000-8000-000000000203';

const USERS_CREATE = 'USERS:CREATE';
const USERS_EMAIL_UPDATE = 'USERS:EMAIL_UPDATE';
const USERS_PASSWORD_CHANGE = 'USERS:PASSWORD_CHANGE';
const USERS_DELETE = 'USERS:DELETE';

// This suite boots the real Nest module graph (AppModule) and the real
// GlobalHttpExceptionFilter, then drives the four `users` endpoints over
// actual HTTP — the review's finding #2: `users.controller.spec.ts` is
// mock-only and the command integration specs assert `ApplicationError.code`
// only, so nothing ever proved the filter maps a thrown domain error to the
// documented HTTP status + code envelope on the real wire (finding #1's
// dead-mapping bug shipped invisibly for exactly this reason).
// eslint-disable-next-line max-lines-per-function -- integration suite setup is inherently long
describeIntegration('users HTTP contract', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedWarehouseAndRoles = async (): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      name: 'Warehouse A',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: creatorRoleId,
        warehouseId,
        name: 'Creator Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: targetRoleId,
        warehouseId,
        name: 'Target Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: managerRoleId,
        warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const grantPermissions = async (
    roleId: string,
    permissionIds: readonly string[],
  ): Promise<void> => {
    await dataSource.manager.getRepository(PermissionEntity).insert(
      permissionIds.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await dataSource.manager.getRepository(RolePermissionEntity).insert(
      permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
        roleKind: 'custom' as const,
        permissionKind: 'assignable' as const,
      })),
    );
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
  // so both inserts must run inside one transaction.
  const seedIdentity = async (
    userId: string,
    normalizedEmail: string,
  ): Promise<void> => {
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: now,
        updatedAt: now,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedMembership = async (
    userId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId,
      roleId,
      roleKind,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedSessionCookie = async (accountId: string): Promise<string> => {
    // `CurrentSessionQuery` validates against the real wall clock
    // (`authRuntime.now()`), not the fixture `now` used for the seeded
    // domain rows above, so this session's validity window must be
    // anchored to the real current time rather than the fixed fixture date.
    const secret = randomUUID();
    const establishedAt = new Date();
    await dataSource.manager.getRepository(SessionEntity).insert({
      id: randomUUID(),
      accountId,
      secretDigest: digestSessionSecret(secret),
      establishedAt,
      expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
      revokedAt: null,
    });
    return `${AUTH_SESSION_COOKIE}=${secret}`;
  };

  const request = async (
    method: string,
    path: string,
    cookie: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        cookie,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  it('POST /api/v1/users creates a member and returns 201 with the safe envelope (AC-01)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request('POST', '/api/v1/users', cookie, {
      email: 'new.member@example.test',
      password: 'a-valid-password-1',
      roleId: targetRoleId,
    });

    expect(status).toBe(201);
    expect(body).toMatchObject({
      email: 'new.member@example.test',
      roleId: targetRoleId,
    });
  });

  it("POST /api/v1/users returns 409 users.permission_exceeded when the selected Role's Permissions exceed the actor's own (AC-16)", async () => {
    await seedWarehouseAndRoles();
    // The creator holds USERS:CREATE only; the target Role additionally
    // grants USERS:DELETE, which the creator does not hold.
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    await grantPermissions(targetRoleId, [USERS_DELETE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request('POST', '/api/v1/users', cookie, {
      email: 'new.member@example.test',
      password: 'a-valid-password-1',
      roleId: targetRoleId,
    });

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.permission_exceeded' });
  });

  it('PATCH /api/v1/users/:id/email returns 409 users.self_action_denied for a self-targeted change (AC-18)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_EMAIL_UPDATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, creatorRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/users/${actorId}/email`,
      cookie,
      { email: 'new-self-email@example.test' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.self_action_denied' });
  });

  it('PATCH /api/v1/users/:id/password returns 409 users.manager_role_protected for a Manager-held target (AC-14)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_PASSWORD_CHANGE]);
    const actorId = randomUUID();
    const managerId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(managerId, 'manager@example.test');
    await seedMembership(actorId, creatorRoleId);
    await seedMembership(managerId, managerRoleId, 'warehouse_manager');
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/users/${managerId}/password`,
      cookie,
      { password: 'a-new-strong-password' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.manager_role_protected' });
  });

  it('DELETE /api/v1/users/:id deletes the target and returns 204 with no body (AC-08)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, creatorRoleId);
    await seedMembership(targetId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/users/${targetId}`,
      cookie,
    );

    expect(status).toBe(204);
    expect(body).toBeUndefined();
  });

  it('DELETE /api/v1/users/:id returns 404 access.target_unavailable for a missing target without disclosing existence (AC-09)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, creatorRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/users/${randomUUID()}`,
      cookie,
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'access.target_unavailable' });
  });

  it('POST /api/v1/users returns 401 without a valid session', async () => {
    const { status } = await request(
      'POST',
      '/api/v1/users',
      `${AUTH_SESSION_COOKIE}=not-a-real-session`,
      {
        email: 'x@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(401);
  });
});
