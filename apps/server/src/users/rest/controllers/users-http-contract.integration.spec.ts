import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'app.module.js';
import { digestSessionSecret } from 'auth/domain/security/session-secret.js';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie.js';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { PermissionEntity } from 'shared/domain/entities/permission.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity.js';
import { SessionEntity } from 'shared/domain/entities/session.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-06T12:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000100';
const warehouseId = '00000000-0000-4000-8000-000000000101';
// A second Warehouse of the *same* Workspace, with its own membership
// namespace. It exists only to prove that each handler resolves authority
// from the Warehouse *named in the path* rather than from any membership the
// actor happens to hold elsewhere (AC-03a, AC-05) — T27 DoD "resolves the
// membership in the named Warehouse".
const otherWarehouseId = '00000000-0000-4000-8000-000000000102';
const creatorRoleId = '00000000-0000-4000-8000-000000000201';
const targetRoleId = '00000000-0000-4000-8000-000000000202';
const managerRoleId = '00000000-0000-4000-8000-000000000203';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000204';

const USERS_CREATE = 'USERS:CREATE';
const USERS_EMAIL_UPDATE = 'USERS:EMAIL_UPDATE';
const USERS_PASSWORD_CHANGE = 'USERS:PASSWORD_CHANGE';
const USERS_DELETE = 'USERS:DELETE';

// This suite boots the real Nest module graph (AppModule) and the real
// GlobalHttpExceptionFilter, then drives the four `warehouse-users` endpoints
// (T27 — re-pathed from `/api/v1/users/*` to
// `/api/v1/warehouses/{warehouseId}/users/*`, api-sync-report.md F-2) over
// actual HTTP — the review's finding #2: `users.controller.spec.ts` is
// mock-only and the command integration specs assert `ApplicationError.code`
// only, so nothing ever proved the filter maps a thrown domain error to the
// documented HTTP status + code envelope on the real wire (finding #1's
// dead-mapping bug shipped invisibly for exactly this reason).
// eslint-disable-next-line max-lines-per-function, max-statements -- integration suite setup is inherently long
describe('warehouse-users HTTP contract', () => {
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
      'TRUNCATE warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedWarehouseAndRoles = async (): Promise<void> => {
    await dataSource.manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(WarehouseEntity).insert([
      {
        id: warehouseId,
        workspaceId,
        name: 'Warehouse A',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        createdAt: now,
        updatedAt: now,
      },
    ]);
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
      {
        id: otherWarehouseRoleId,
        warehouseId: otherWarehouseId,
        name: 'Other Warehouse Role',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  };

  const setWarehouseArchived = async (
    id: string,
    archivedAt: Date | null,
  ): Promise<void> => {
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id }, { archivedAt });
  };

  const grantPermissions = async (
    roleId: string,
    permissionIds: readonly string[],
  ): Promise<void> => {
    await dataSource.manager.getRepository(PermissionEntity).upsert(
      permissionIds.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: now,
        updatedAt: now,
      })),
      ['id'],
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
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const seedMembership = async (
    userId: string,
    userWarehouseId: string,
    roleId: string,
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: userWarehouseId,
      workspaceId,
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

  it('POST /api/v1/warehouses/:warehouseId/users creates a member and returns 201 with the safe envelope (AC-01)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      cookie,
      {
        email: 'new.member@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({
      email: 'new.member@example.test',
      roleId: targetRoleId,
    });
  });

  it("POST /api/v1/warehouses/:warehouseId/users returns 409 users.permission_exceeded when the selected Role's Permissions exceed the actor's own (AC-16)", async () => {
    await seedWarehouseAndRoles();
    // The creator holds USERS:CREATE only; the target Role additionally
    // grants USERS:DELETE, which the creator does not hold.
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    await grantPermissions(targetRoleId, [USERS_DELETE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      cookie,
      {
        email: 'new.member@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.permission_exceeded' });
  });

  it('POST /api/v1/warehouses/:warehouseId/users returns 400 request.invalid for a malformed body (contract schema validation)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      cookie,
      {
        email: 'not-an-email',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'request.invalid' });
  });

  it('POST /api/v1/warehouses/:warehouseId/users returns 409 access.denied when the actor holds no membership in the *named* Warehouse, even though they hold one in another Warehouse of the same Workspace (AC-05, T27 DoD "named Warehouse")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    // Membership only in `warehouseId`, never in `otherWarehouseId`.
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${otherWarehouseId}/users`,
      cookie,
      {
        email: 'new.member@example.test',
        password: 'a-valid-password-1',
        roleId: otherWarehouseRoleId,
      },
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.denied' });
  });

  it('POST /api/v1/warehouses/:warehouseId/users returns 409 access.warehouse_archived when the named Warehouse is archived (AC-12, T27 DoD "denied on an archived one")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      cookie,
      {
        email: 'new.member@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it("POST /api/v1/warehouses/:warehouseId/users establishes the created member's Workspace relation from the Workspace owning that Warehouse (AC-24)", async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_CREATE]);
    const creatorId = randomUUID();
    await seedIdentity(creatorId, 'creator@example.test');
    await seedMembership(creatorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(creatorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      cookie,
      {
        email: 'workspace-relation@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(201);
    const createdUserId = (body as { userId: string }).userId;

    const createdUser = await dataSource.manager
      .getRepository(UserEntity)
      .findOneBy({ id: createdUserId });
    expect(createdUser?.workspaceId).toBe(workspaceId);
  });

  it("PATCH /api/v1/warehouses/:warehouseId/users/:userId/email changes the member's email and returns 200 (success shape)", async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_EMAIL_UPDATE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}/email`,
      cookie,
      { email: 'target.updated@example.test' },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      userId: targetId,
      email: 'target.updated@example.test',
    });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/email returns 409 users.self_action_denied for a self-targeted change (AC-18)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_EMAIL_UPDATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${actorId}/email`,
      cookie,
      { email: 'new-self-email@example.test' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.self_action_denied' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/email returns 403 access.denied when the actor holds no membership in the *named* Warehouse (AC-05, T27 DoD "named Warehouse")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_EMAIL_UPDATE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, otherWarehouseId, otherWarehouseRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${otherWarehouseId}/users/${targetId}/email`,
      cookie,
      { email: 'irrelevant@example.test' },
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.denied' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/email returns 409 access.warehouse_archived when the named Warehouse is archived (AC-12, T27 DoD "denied on an archived one")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_EMAIL_UPDATE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}/email`,
      cookie,
      { email: 'irrelevant@example.test' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it("PATCH /api/v1/warehouses/:warehouseId/users/:userId/password changes the member's password and returns 200 (success shape)", async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_PASSWORD_CHANGE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}/password`,
      cookie,
      { password: 'a-new-strong-password' },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ userId: targetId });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/password returns 409 users.manager_role_protected for a Manager-held target (AC-14)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_PASSWORD_CHANGE]);
    const actorId = randomUUID();
    const managerId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(managerId, 'manager@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${managerId}/password`,
      cookie,
      { password: 'a-new-strong-password' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'users.manager_role_protected' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/password returns 403 access.denied when the actor holds no membership in the *named* Warehouse (AC-05, T27 DoD "named Warehouse")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_PASSWORD_CHANGE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, otherWarehouseId, otherWarehouseRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${otherWarehouseId}/users/${targetId}/password`,
      cookie,
      { password: 'irrelevant-password-1' },
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.denied' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/users/:userId/password returns 409 access.warehouse_archived when the named Warehouse is archived (AC-12, T27 DoD "denied on an archived one")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_PASSWORD_CHANGE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}/password`,
      cookie,
      { password: 'irrelevant-password-1' },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it('DELETE /api/v1/warehouses/:warehouseId/users/:userId deletes the target and returns 204 with no body (AC-08)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}`,
      cookie,
    );

    expect(status).toBe(204);
    expect(body).toBeUndefined();
  });

  it('DELETE /api/v1/warehouses/:warehouseId/users/:userId returns 404 access.target_unavailable for a missing target without disclosing existence (AC-09)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/warehouses/${warehouseId}/users/${randomUUID()}`,
      cookie,
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'access.target_unavailable' });
  });

  it('DELETE /api/v1/warehouses/:warehouseId/users/:userId returns 403 access.denied when the actor holds no membership in the *named* Warehouse (AC-05, T27 DoD "named Warehouse")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, otherWarehouseId, otherWarehouseRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/warehouses/${otherWarehouseId}/users/${targetId}`,
      cookie,
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.denied' });
  });

  it('DELETE /api/v1/warehouses/:warehouseId/users/:userId returns 409 access.warehouse_archived when the named Warehouse is archived (AC-12, T27 DoD "denied on an archived one")', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(creatorRoleId, [USERS_DELETE]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, creatorRoleId);
    await seedMembership(targetId, warehouseId, targetRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/warehouses/${warehouseId}/users/${targetId}`,
      cookie,
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it('POST /api/v1/warehouses/:warehouseId/users returns 401 without a valid session', async () => {
    await seedWarehouseAndRoles();

    const { status } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/users`,
      `${AUTH_SESSION_COOKIE}=not-a-real-session`,
      {
        email: 'x@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    );

    expect(status).toBe(401);
  });

  // T27 DoD: "A request to any of these paths without a warehouseId cannot
  // reach a handler." AC-03a is encoded structurally — `warehouseId` is a
  // required path segment on every warehouse-users route — so a request that
  // omits it matches no route at all and never reaches
  // `WarehouseAccessGuard`, let alone a handler. The old, un-Warehouse-scoped
  // `/api/v1/users*` surface (api-sync-report.md F-2) is retired for the
  // same structural reason.
  it.each([
    [
      'POST',
      '/api/v1/users',
      {
        email: 'x@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    ],
    [
      'POST',
      '/api/v1/warehouses/users',
      {
        email: 'x@example.test',
        password: 'a-valid-password-1',
        roleId: targetRoleId,
      },
    ],
    ['DELETE', `/api/v1/users/${randomUUID()}`, undefined],
    [
      'PATCH',
      `/api/v1/users/${randomUUID()}/email`,
      { email: 'x@example.test' },
    ],
    [
      'PATCH',
      `/api/v1/users/${randomUUID()}/password`,
      { password: 'a-valid-password-1' },
    ],
  ] as const)(
    '%s %s matches no route without a named Warehouse and never reaches a handler',
    async (method, path, body) => {
      await seedWarehouseAndRoles();
      await grantPermissions(creatorRoleId, [
        USERS_CREATE,
        USERS_DELETE,
        USERS_EMAIL_UPDATE,
        USERS_PASSWORD_CHANGE,
      ]);
      const actorId = randomUUID();
      await seedIdentity(actorId, 'actor@example.test');
      await seedMembership(actorId, warehouseId, creatorRoleId);
      const cookie = await seedSessionCookie(actorId);

      const { status } = await request(method, path, cookie, body);

      expect(status).toBe(404);
    },
  );
});
