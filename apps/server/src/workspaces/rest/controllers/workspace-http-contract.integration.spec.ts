import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
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
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const now = new Date('2026-08-12T12:00:00.000Z');

interface Actor {
  readonly userId: string;
  readonly cookie: string;
}

interface WorkspaceFixture {
  readonly workspaceId: string;
  readonly ownerRoleId: string;
  readonly customRoleId: string;
  readonly warehouseId: string;
  readonly warehouseRoleId: string;
}

// This suite boots the real Nest module graph (`AppModule`), the real global
// Zod pipe and the real `GlobalHttpExceptionFilter`, then drives every
// `/api/v1/workspace/*` operation of `contracts/openapi.yaml` whose subject is
// the Workspace record itself over actual HTTP (T24 DoD). Only the wire is
// asserted: request-schema validation, the documented success shape, and the
// stable error code and status of each documented failure branch — including
// the non-enumerating cross-Workspace failure (AC-34) and the
// access-is-not-permitted denial (AC-30, AC-31).
//
// The roles, members, permissions, users and owner-transfer route families
// moved with their handlers to
// `access/rest/controllers/workspace-access-http-contract.integration.spec.ts`
// (CH-S2); every case below is unchanged (CR-RG-01).
// eslint-disable-next-line max-lines-per-function -- an HTTP contract suite covering one surface is inherently long
describe('workspace HTTP contract', () => {
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
      'TRUNCATE workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedWorkspace = async (
    name: string | null = null,
  ): Promise<WorkspaceFixture> => {
    const workspaceId = randomUUID();
    const ownerRoleId = randomUUID();
    const customRoleId = randomUUID();
    const warehouseId = randomUUID();
    const warehouseRoleId = randomUUID();

    await dataSource.manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name,
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(WorkspaceRoleEntity).insert([
      {
        id: ownerRoleId,
        workspaceId,
        name: 'Workspace Owner',
        kind: 'workspace_owner',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: customRoleId,
        workspaceId,
        name: 'Site Administrator',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await dataSource.manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      workspaceId,
      name: 'Test Warehouse North',
      createdAt: now,
      updatedAt: now,
    });
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: warehouseRoleId,
      warehouseId,
      name: 'Warehouse Manager',
      kind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    });

    return {
      workspaceId,
      ownerRoleId,
      customRoleId,
      warehouseId,
      warehouseRoleId,
    };
  };

  const grantWorkspacePermissions = async (
    workspaceRoleId: string,
    workspaceRoleKind: 'custom' | 'workspace_owner',
    permissionIds: readonly string[],
    kind: 'assignable' | 'reserved' = 'assignable',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WorkspacePermissionEntity).upsert(
      permissionIds.map((id) => ({
        id,
        label: id,
        kind,
        createdAt: now,
        updatedAt: now,
      })),
      ['id'],
    );
    await dataSource.manager
      .getRepository(WorkspaceRolePermissionEntity)
      .insert(
        permissionIds.map((workspacePermissionId) => ({
          workspaceRoleId,
          workspacePermissionId,
          workspaceRoleKind,
          workspacePermissionKind: kind,
        })),
      );
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair,
  // so both inserts must run inside one transaction.
  const seedUser = async (workspaceId: string): Promise<string> => {
    const userId = randomUUID();
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `member.${userId}@example.test`,
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
    return userId;
  };

  const seedWorkspaceMembership = async (
    userId: string,
    workspaceId: string,
    workspaceRoleId: string,
    workspaceRoleKind: 'custom' | 'workspace_owner' = 'custom',
  ): Promise<void> => {
    await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
      userId,
      workspaceId,
      workspaceRoleId,
      workspaceRoleKind,
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedWarehouseMembership = async (
    userId: string,
    fixture: WorkspaceFixture,
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: fixture.warehouseId,
      workspaceId: fixture.workspaceId,
      roleId: fixture.warehouseRoleId,
      roleKind: 'warehouse_manager',
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedSessionCookie = async (accountId: string): Promise<string> => {
    // Session validity is checked against the real wall clock, not the fixed
    // fixture date the domain rows above use.
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

  /** A Workspace Member of `fixture` holding exactly the given Workspace Permissions. */
  const seedActor = async (
    fixture: WorkspaceFixture,
    permissionIds: readonly string[],
    options: {
      readonly kind?: 'custom' | 'workspace_owner';
      readonly permissionKind?: 'assignable' | 'reserved';
    } = {},
  ): Promise<Actor> => {
    const kind = options.kind ?? 'custom';
    const roleId =
      kind === 'custom' ? fixture.customRoleId : fixture.ownerRoleId;
    const userId = await seedUser(fixture.workspaceId);
    await grantWorkspacePermissions(
      roleId,
      kind,
      permissionIds,
      options.permissionKind,
    );
    await seedWorkspaceMembership(userId, fixture.workspaceId, roleId, kind);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  const request = async (
    method: string,
    path: string,
    cookie?: string,
    body?: unknown,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  describe('GET /api/v1/workspace/context', () => {
    it('answers the actor projection with the effective selection (AC-03b)', async () => {
      const fixture = await seedWorkspace('Test Workspace');
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);
      await seedWarehouseMembership(actor.userId, fixture);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/context',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        workspace: { id: fixture.workspaceId, name: 'Test Workspace' },
        workspacePermissionIds: [WorkspacePermissionId.WAREHOUSES_WATCH],
        warehouses: [
          {
            warehouseId: fixture.warehouseId,
            name: 'Test Warehouse North',
            archivedAt: null,
            roleId: fixture.warehouseRoleId,
            roleKind: 'warehouse_manager',
          },
        ],
        effectiveWarehouseId: fixture.warehouseId,
      });
    });

    // AC-30 — the empty projection is how the web omits every Workspace
    // control, navigation entry and destination for a Warehouse Member who is
    // no Workspace Member at all. It must be an answer, never a denial.
    it('answers for a Warehouse Member who is no Workspace Member (AC-30)', async () => {
      const fixture = await seedWorkspace('Test Workspace');
      const userId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(userId, fixture);
      const cookie = await seedSessionCookie(userId);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/context',
        cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({ workspacePermissionIds: [] });
    });

    it('refuses an unauthenticated read', async () => {
      const { status } = await request('GET', '/api/v1/workspace/context');

      expect(status).toBe(401);
    });
  });

  describe('PUT /api/v1/workspace/active-warehouse', () => {
    it('retains the selection of a Warehouse the actor belongs to (AC-03)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, []);
      await seedWarehouseMembership(actor.userId, fixture);

      const { status, body } = await request(
        'PUT',
        '/api/v1/workspace/active-warehouse',
        actor.cookie,
        { warehouseId: fixture.warehouseId },
      );

      expect(status).toBe(200);
      expect(body).toEqual({ effectiveWarehouseId: fixture.warehouseId });
    });

    it('rejects a request whose body is not the agreed schema', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, []);

      const { status } = await request(
        'PUT',
        '/api/v1/workspace/active-warehouse',
        actor.cookie,
        { warehouseId: 'not-a-uuid' },
      );

      expect(status).toBe(400);
    });

    // AC-04/AC-34 — a Warehouse of another Workspace and a Warehouse that does
    // not exist fail identically, and neither discloses existence.
    it('reports a cross-Workspace Warehouse exactly as a missing one (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, []);
      await seedWarehouseMembership(actor.userId, fixture);

      const crossWorkspace = await request(
        'PUT',
        '/api/v1/workspace/active-warehouse',
        actor.cookie,
        { warehouseId: other.warehouseId },
      );
      const missing = await request(
        'PUT',
        '/api/v1/workspace/active-warehouse',
        actor.cookie,
        { warehouseId: randomUUID() },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('refuses an archived Warehouse (AC-11)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, []);
      await seedWarehouseMembership(actor.userId, fixture);
      await dataSource.manager
        .getRepository(WarehouseEntity)
        .update({ id: fixture.warehouseId }, { archivedAt: now });

      const { status, body } = await request(
        'PUT',
        '/api/v1/workspace/active-warehouse',
        actor.cookie,
        { warehouseId: fixture.warehouseId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.warehouse_archived' });
    });
  });

  describe('PATCH /api/v1/workspace', () => {
    it('records the trimmed name under WORKSPACE:RENAME (AC-29)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_RENAME,
      ]);

      const { status, body } = await request(
        'PATCH',
        '/api/v1/workspace',
        actor.cookie,
        { name: '  Test Workspace  ' },
      );

      expect(status).toBe(200);
      expect(body).toEqual({ id: fixture.workspaceId, name: 'Test Workspace' });
    });

    it('names the broken Workspace-name rule (AC-29a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_RENAME,
      ]);

      const { status, body } = await request(
        'PATCH',
        '/api/v1/workspace',
        actor.cookie,
        { name: `Test${String.fromCodePoint(0x00)}Workspace` },
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'workspace.invalid_input' });
    });

    // AC-30 — a Workspace Member without the Permission is told access is not
    // permitted rather than shown the capability.
    it('tells an actor lacking the Permission that access is not permitted (AC-30)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const { status, body } = await request(
        'PATCH',
        '/api/v1/workspace',
        actor.cookie,
        { name: 'Test Workspace' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });

    // AC-31 — a Warehouse Permission never authorizes a Workspace capability.
    // The actor below is a Warehouse Manager holding every Warehouse
    // Permission and no Workspace Permission at all.
    it('denies an actor holding only Warehouse Permissions (AC-31)', async () => {
      const fixture = await seedWorkspace();
      const userId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(userId, fixture);
      await dataSource.manager.getRepository(PermissionEntity).upsert(
        [
          {
            id: 'ROLES:UPDATE',
            label: 'ROLES:UPDATE',
            kind: 'assignable' as const,
            createdAt: now,
            updatedAt: now,
          },
        ],
        ['id'],
      );
      await dataSource.manager.getRepository(RolePermissionEntity).insert({
        roleId: fixture.warehouseRoleId,
        permissionId: 'ROLES:UPDATE',
        roleKind: 'warehouse_manager',
        permissionKind: 'assignable',
      });
      const cookie = await seedSessionCookie(userId);

      const { status, body } = await request(
        'PATCH',
        '/api/v1/workspace',
        cookie,
        { name: 'Test Workspace' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });
});
