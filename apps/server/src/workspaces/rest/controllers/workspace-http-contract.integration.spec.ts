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

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

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
// the Workspace itself over actual HTTP (T24 DoD). Only the wire is asserted:
// request-schema validation, the documented success shape, and the stable
// error code and status of each documented failure branch — including the
// non-enumerating cross-Workspace failure (AC-34) and the
// access-is-not-permitted denial (AC-30, AC-31).
// eslint-disable-next-line max-lines-per-function -- an HTTP contract suite covering one surface is inherently long
describeIntegration('workspace HTTP contract', () => {
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

  describe('/api/v1/workspace/roles and /api/v1/workspace/permissions', () => {
    it('lists the Workspace Roles under WORKSPACE_ROLES:WATCH (AC-32)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/roles',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        {
          id: fixture.customRoleId,
          name: 'Site Administrator',
          kind: 'custom',
          workspacePermissionIds: [WorkspacePermissionId.WORKSPACE_ROLES_WATCH],
        },
        {
          id: fixture.ownerRoleId,
          name: 'Workspace Owner',
          kind: 'workspace_owner',
          workspacePermissionIds: [],
        },
      ]);
    });

    // AC-34 — another Workspace's configuration is never disclosed. The read
    // is scoped in SQL to the actor's Workspace, so the other Workspace's
    // Roles are simply absent rather than filtered afterwards.
    it('never returns a Workspace Role of another Workspace (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]);

      const { body } = await request(
        'GET',
        '/api/v1/workspace/roles',
        actor.cookie,
      );

      expect(JSON.stringify(body)).not.toContain(other.customRoleId);
    });

    it('lists the system Workspace Permission catalogue (AC-32)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/permissions',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        {
          id: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
          label: WorkspacePermissionId.WORKSPACE_ROLES_WATCH,
          kind: 'assignable',
        },
      ]);
    });

    it('creates a custom Workspace Role and returns 201 (AC-14)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/roles',
        actor.cookie,
        { name: 'Warehouse Watcher', workspacePermissionIds: [] },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        name: 'Warehouse Watcher',
        kind: 'custom',
        workspacePermissionIds: [],
        assignedMemberCount: 0,
      });
    });

    it('rejects a Workspace Role write that is not the agreed schema', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
      ]);

      const { status } = await request(
        'POST',
        '/api/v1/workspace/roles',
        actor.cookie,
        { name: '', workspacePermissionIds: ['NOT_A_PERMISSION'] },
      );

      expect(status).toBe(400);
    });

    it('refuses a duplicate Workspace Role name (AC-15)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_CREATE,
      ]);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/roles',
        actor.cookie,
        { name: 'Site Administrator', workspacePermissionIds: [] },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.role_name_conflict' });
    });

    it('updates a custom Workspace Role (AC-14a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/roles/${fixture.customRoleId}`,
        actor.cookie,
        { name: 'Renamed Role', workspacePermissionIds: [] },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: fixture.customRoleId,
        name: 'Renamed Role',
        kind: 'custom',
        workspacePermissionIds: [],
      });
    });

    // AC-34 — a Workspace Role of another Workspace is reported exactly as a
    // Workspace Role that does not exist.
    it('reports a cross-Workspace Workspace Role exactly as a missing one (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
      ]);
      const body = { name: 'Renamed Role', workspacePermissionIds: [] };

      const crossWorkspace = await request(
        'PATCH',
        `/api/v1/workspace/roles/${other.customRoleId}`,
        actor.cookie,
        body,
      );
      const missing = await request(
        'PATCH',
        `/api/v1/workspace/roles/${randomUUID()}`,
        actor.cookie,
        body,
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('refuses to update the protected Workspace Owner Role (AC-16)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_UPDATE,
      ]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/workspace/roles/${fixture.ownerRoleId}`,
        actor.cookie,
        { name: 'Renamed Owner', workspacePermissionIds: [] },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'workspace.protected_role' });
    });

    it('deletes an unassigned custom Workspace Role with 204 (AC-17a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(
        fixture,
        [WorkspacePermissionId.WORKSPACE_ROLES_DELETE],
        { kind: 'workspace_owner' },
      );

      const { status } = await request(
        'DELETE',
        `/api/v1/workspace/roles/${fixture.customRoleId}`,
        actor.cookie,
      );

      expect(status).toBe(204);
    });

    it('refuses to delete an assigned Workspace Role with no replacement (AC-17c)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_DELETE,
      ]);

      const { status, body } = await request(
        'DELETE',
        `/api/v1/workspace/roles/${fixture.customRoleId}`,
        actor.cookie,
      );

      expect(status).toBe(400);
      expect(body).toMatchObject({
        code: 'workspace.replacement_role_required',
      });
    });
  });

  // eslint-disable-next-line max-lines-per-function -- one describe per route family
  describe('/api/v1/workspace/members, /users and /owner-transfer', () => {
    it('lists the Workspace Members under WORKSPACE_MEMBERS:WATCH (AC-33)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      ]);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/members',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        {
          userId: actor.userId,
          workspaceRoleId: fixture.customRoleId,
          workspaceRoleKind: 'custom',
        },
      ]);
    });

    it('lists the Users of the Workspace with the Warehouses each belongs to (AC-33)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      ]);
      await seedWarehouseMembership(actor.userId, fixture);

      const { status, body } = await request(
        'GET',
        '/api/v1/workspace/users',
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        {
          userId: actor.userId,
          warehouses: [{ warehouseId: fixture.warehouseId }],
        },
      ]);
    });

    // AC-34 — the Users of another Workspace are never disclosed.
    it('never returns a User of another Workspace (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const otherUserId = await seedUser(other.workspaceId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
      ]);

      const { body } = await request(
        'GET',
        '/api/v1/workspace/users',
        actor.cookie,
      );

      expect(JSON.stringify(body)).not.toContain(otherUserId);
    });

    it('denies a watch read to an actor without the watch Permission (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WAREHOUSES_WATCH,
      ]);

      const roles = await request(
        'GET',
        '/api/v1/workspace/roles',
        actor.cookie,
      );
      const members = await request(
        'GET',
        '/api/v1/workspace/members',
        actor.cookie,
      );

      expect(roles.status).toBe(403);
      expect(roles.body).toMatchObject({ code: 'workspace.denied' });
      expect(members.status).toBe(403);
    });

    it('adds a Workspace Member and returns 201 (AC-19)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
      ]);
      const candidateId = await seedUser(fixture.workspaceId);
      await seedWarehouseMembership(candidateId, fixture);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/members',
        actor.cookie,
        { userId: candidateId, workspaceRoleId: fixture.customRoleId },
      );

      expect(status).toBe(201);
      expect(body).toEqual({
        userId: candidateId,
        workspaceRoleId: fixture.customRoleId,
        workspaceRoleKind: 'custom',
      });
    });

    it('refuses a candidate holding no Warehouse membership of this Workspace (AC-20)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
      ]);
      const candidateId = await seedUser(fixture.workspaceId);

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/members',
        actor.cookie,
        { userId: candidateId, workspaceRoleId: fixture.customRoleId },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'workspace.warehouse_membership_required',
      });
    });

    it('reports a cross-Workspace candidate exactly as a missing one (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const otherUserId = await seedUser(other.workspaceId);
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_ADD,
      ]);

      const crossWorkspace = await request(
        'POST',
        '/api/v1/workspace/members',
        actor.cookie,
        { userId: otherUserId, workspaceRoleId: fixture.customRoleId },
      );
      const missing = await request(
        'POST',
        '/api/v1/workspace/members',
        actor.cookie,
        { userId: randomUUID(), workspaceRoleId: fixture.customRoleId },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('removes a Workspace membership with 204 (AC-19a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      await seedWorkspaceMembership(
        targetId,
        fixture.workspaceId,
        fixture.customRoleId,
      );

      const { status } = await request(
        'DELETE',
        `/api/v1/workspace/members/${targetId}`,
        actor.cookie,
      );

      expect(status).toBe(204);
    });

    it('reports a cross-Workspace Workspace Member exactly as a missing one (AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const otherUserId = await seedUser(other.workspaceId);
      await seedWorkspaceMembership(
        otherUserId,
        other.workspaceId,
        other.customRoleId,
      );
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
      ]);

      const crossWorkspace = await request(
        'DELETE',
        `/api/v1/workspace/members/${otherUserId}`,
        actor.cookie,
      );
      const missing = await request(
        'DELETE',
        `/api/v1/workspace/members/${randomUUID()}`,
        actor.cookie,
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('refuses to remove the current Workspace Owner (AC-21a)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_MEMBERS_REMOVE,
      ]);
      const ownerId = await seedUser(fixture.workspaceId);
      await seedWorkspaceMembership(
        ownerId,
        fixture.workspaceId,
        fixture.ownerRoleId,
        'workspace_owner',
      );

      const { status, body } = await request(
        'DELETE',
        `/api/v1/workspace/members/${ownerId}`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({
        code: 'workspace.owner_transfer_required',
      });
    });

    it('moves a Workspace Member to another custom Workspace Role (AC-19b)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_ROLES_ASSIGN,
      ]);
      const targetId = await seedUser(fixture.workspaceId);
      const secondRoleId = randomUUID();
      await dataSource.manager.getRepository(WorkspaceRoleEntity).insert({
        id: secondRoleId,
        workspaceId: fixture.workspaceId,
        name: 'Warehouse Watcher',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      });
      await seedWorkspaceMembership(
        targetId,
        fixture.workspaceId,
        fixture.customRoleId,
      );

      const { status, body } = await request(
        'PUT',
        `/api/v1/workspace/members/${targetId}/role`,
        actor.cookie,
        { workspaceRoleId: secondRoleId },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        userId: targetId,
        workspaceRoleId: secondRoleId,
        workspaceRoleKind: 'custom',
      });
    });

    it('transfers Workspace Owner as one outcome (AC-26)', async () => {
      const fixture = await seedWorkspace();
      const owner = await seedActor(
        fixture,
        [WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN],
        { kind: 'workspace_owner', permissionKind: 'reserved' },
      );
      const recipientId = await seedUser(fixture.workspaceId);
      await seedWorkspaceMembership(
        recipientId,
        fixture.workspaceId,
        fixture.customRoleId,
      );

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/owner-transfer',
        owner.cookie,
        {
          recipientUserId: recipientId,
          formerOwnerWorkspaceRoleId: fixture.customRoleId,
        },
      );

      expect(status).toBe(200);
      expect(body).toEqual({
        ownerUserId: recipientId,
        formerOwnerUserId: owner.userId,
        formerOwnerWorkspaceRoleId: fixture.customRoleId,
      });
    });

    it('reports a cross-Workspace recipient exactly as a missing one (AC-28, AC-34)', async () => {
      const fixture = await seedWorkspace();
      const other = await seedWorkspace();
      const otherUserId = await seedUser(other.workspaceId);
      await seedWorkspaceMembership(
        otherUserId,
        other.workspaceId,
        other.customRoleId,
      );
      const owner = await seedActor(
        fixture,
        [WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN],
        { kind: 'workspace_owner', permissionKind: 'reserved' },
      );

      const crossWorkspace = await request(
        'POST',
        '/api/v1/workspace/owner-transfer',
        owner.cookie,
        {
          recipientUserId: otherUserId,
          formerOwnerWorkspaceRoleId: fixture.customRoleId,
        },
      );
      const missing = await request(
        'POST',
        '/api/v1/workspace/owner-transfer',
        owner.cookie,
        {
          recipientUserId: randomUUID(),
          formerOwnerWorkspaceRoleId: fixture.customRoleId,
        },
      );

      expect(crossWorkspace.status).toBe(404);
      expect(crossWorkspace.body).toMatchObject({
        code: 'workspace.target_unavailable',
      });
      expect(crossWorkspace).toEqual(missing);
    });

    it('denies an Owner transfer to an actor who is not the current Owner (AC-27)', async () => {
      const fixture = await seedWorkspace();
      const actor = await seedActor(fixture, [
        WorkspacePermissionId.WORKSPACE_OWNER_ROLE_REASSIGN,
      ]);
      const recipientId = await seedUser(fixture.workspaceId);
      await seedWorkspaceMembership(
        recipientId,
        fixture.workspaceId,
        fixture.customRoleId,
      );

      const { status, body } = await request(
        'POST',
        '/api/v1/workspace/owner-transfer',
        actor.cookie,
        {
          recipientUserId: recipientId,
          formerOwnerWorkspaceRoleId: fixture.customRoleId,
        },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'workspace.denied' });
    });
  });
});
