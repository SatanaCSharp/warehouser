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
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { GlobalHttpExceptionFilter } from 'shared/errors/global-http-exception.filter';

const describeIntegration =
  process.env.RUN_INTEGRATION === '1' ? describe : describe.skip;

// Fixed clock. `chk_warehouses_archival_order` rejects `archivedAt < createdAt`, so every seeded
// row and every archival timestamp below is pinned to this same instant rather than the real wall
// clock (three prior commits fixed fixtures that skipped this).
const now = new Date('2026-08-06T12:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000300';
const warehouseId = '00000000-0000-4000-8000-000000000301';
// A second Warehouse of the *same* Workspace, used only to prove a handler resolves authority from
// the Warehouse named in the path rather than any membership the actor happens to hold elsewhere
// (AC-03a, AC-05), mirroring T27's `otherWarehouseId`.
const otherWarehouseId = '00000000-0000-4000-8000-000000000302';

const managerRoleId = '00000000-0000-4000-8000-000000000401';
const custodianRoleId = '00000000-0000-4000-8000-000000000402';
const replacementRoleId = '00000000-0000-4000-8000-000000000403';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000404';

const ROLES_WATCH = 'ROLES:WATCH';
const ROLES_CREATE = 'ROLES:CREATE';
const ROLES_UPDATE = 'ROLES:UPDATE';
const ROLES_DELETE = 'ROLES:DELETE';
const ROLES_ASSIGN = 'ROLES:ASSIGN';
const USERS_WATCH = 'USERS:WATCH';
const WAREHOUSE_MANAGER_ROLE_REASSIGN = 'WAREHOUSE_MANAGER_ROLE:REASSIGN';

// This suite drives the T26 re-shape of `/api/v1/access/*` to
// `/api/v1/warehouses/{warehouseId}/access/*` over real HTTP, mirroring
// `users-http-contract.integration.spec.ts` (T27's equivalent re-shape, e4a28f1). It proves:
//   - every access handler is reachable only under the named-Warehouse path (AC-03a);
//   - every *mutating* handler is denied on an archived Warehouse (AC-12);
//   - every *read* handler still serves an archived Warehouse, and `current` marks it archived
//     (AC-12a);
//   - manager-transfer is the one archived-tolerant *mutating* handler (AC-36, AC-36a, sad.md §6.7a);
//   - a concurrent manager transfer maps to the stable concurrency error.
// eslint-disable-next-line max-lines-per-function, max-statements -- integration suite setup is inherently long
describeIntegration('warehouse-access HTTP contract', () => {
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

  const grantPermissions = async (
    roleId: string,
    permissionIds: readonly string[],
    roleKind: 'custom' | 'warehouse_manager' = 'custom',
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
        roleKind,
        permissionKind: 'assignable' as const,
      })),
    );
  };

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
        id: managerRoleId,
        warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: custodianRoleId,
        warehouseId,
        name: 'Custodian',
        kind: 'custom',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: replacementRoleId,
        warehouseId,
        name: 'Replacement',
        kind: 'custom',
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
    // Mirrors `ProvisionInitialAccessCommand`'s `MANAGER_PERMISSION_IDS`: the protected Warehouse
    // Manager Role always carries `WAREHOUSE_MANAGER_ROLE:REASSIGN`, so a seeded Manager can reach
    // the manager-transfer handler in these tests the same way a real one would.
    await grantPermissions(
      managerRoleId,
      [WAREHOUSE_MANAGER_ROLE_REASSIGN],
      'warehouse_manager',
    );
  };

  const setWarehouseArchived = async (
    id: string,
    archivedAt: Date | null,
  ): Promise<void> => {
    await dataSource.manager
      .getRepository(WarehouseEntity)
      .update({ id }, { archivedAt });
  };

  // `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
  // run inside one transaction.
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
    // `CurrentSessionQuery` validates against the real wall clock, not the fixed fixture `now`
    // used for the seeded domain rows above, so this session's validity window is anchored to the
    // real current time.
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

  // -- readWarehouseAccess (`current`) -- read, self-projection, marks archived (AC-12a) ----------

  it('GET /api/v1/warehouses/:warehouseId/access/current returns the actor projection for the named Warehouse (AC-05)', async () => {
    await seedWarehouseAndRoles();
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'GET',
      `/api/v1/warehouses/${warehouseId}/access/current`,
      cookie,
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      warehouseId,
      roleId: custodianRoleId,
      roleKind: 'custom',
      archivedAt: null,
    });
  });

  it('GET /api/v1/warehouses/:warehouseId/access/current still serves an archived Warehouse and marks it archived (AC-12a)', async () => {
    await seedWarehouseAndRoles();
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'GET',
      `/api/v1/warehouses/${warehouseId}/access/current`,
      cookie,
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      warehouseId,
      archivedAt: now.toISOString(),
    });
  });

  // -- listRoles / listPermissions / listMembers -- read, archived-tolerant (AC-12a) --------------

  it.each([
    ['listRoles', 'roles', ROLES_WATCH],
    ['listPermissions', 'permissions', ROLES_WATCH],
    ['listMembers', 'members', USERS_WATCH],
  ] as const)(
    'GET /api/v1/warehouses/:warehouseId/access/%s still serves an archived Warehouse (AC-12a)',
    async (_name, segment, permissionId) => {
      await seedWarehouseAndRoles();
      await grantPermissions(custodianRoleId, [permissionId]);
      const actorId = randomUUID();
      await seedIdentity(actorId, 'actor@example.test');
      await seedMembership(actorId, warehouseId, custodianRoleId);
      const cookie = await seedSessionCookie(actorId);
      await setWarehouseArchived(warehouseId, now);

      const { status } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/access/${segment}`,
        cookie,
      );

      expect(status).toBe(200);
    },
  );

  // -- createRole / updateRole / deleteRole / assignMemberRole -- mutating, denied archived (AC-12)

  it('POST /api/v1/warehouses/:warehouseId/access/roles returns 409 access.warehouse_archived on an archived Warehouse (AC-12)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_CREATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/roles`,
      cookie,
      { name: 'New Role', permissionIds: [] },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/access/roles/:roleId returns 409 access.warehouse_archived on an archived Warehouse (AC-12)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_UPDATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/access/roles/${replacementRoleId}`,
      cookie,
      { name: 'Renamed', permissionIds: [] },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it('DELETE /api/v1/warehouses/:warehouseId/access/roles/:roleId returns 409 access.warehouse_archived on an archived Warehouse (AC-12)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_DELETE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'DELETE',
      `/api/v1/warehouses/${warehouseId}/access/roles/${replacementRoleId}`,
      cookie,
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  it('PUT /api/v1/warehouses/:warehouseId/access/members/:userId/role returns 409 access.warehouse_archived on an archived Warehouse (AC-12)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_ASSIGN]);
    const actorId = randomUUID();
    const targetId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedIdentity(targetId, 'target@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    await seedMembership(targetId, warehouseId, replacementRoleId);
    const cookie = await seedSessionCookie(actorId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'PUT',
      `/api/v1/warehouses/${warehouseId}/access/members/${targetId}/role`,
      cookie,
      { roleId: replacementRoleId },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.warehouse_archived' });
  });

  // -- transferWarehouseManager -- the one archived-tolerant *mutating* handler (AC-36, sad §6.7a) -

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer succeeds on a live Warehouse and moves the Manager Role as one outcome (AC-36)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const recipientId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(recipientId, 'recipient@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    await seedMembership(recipientId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(managerId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      { recipientUserId: recipientId, formerManagerRoleId: replacementRoleId },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      managerUserId: recipientId,
      formerManagerUserId: managerId,
      formerManagerRoleId: replacementRoleId,
    });

    const recipientMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: recipientId, warehouseId });
    const formerManagerMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: managerId, warehouseId });
    expect(recipientMembership?.roleKind).toBe('warehouse_manager');
    expect(formerManagerMembership?.roleKind).toBe('custom');
    expect(formerManagerMembership?.roleId).toBe(replacementRoleId);
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer succeeds on an ARCHIVED Warehouse, the one archived-tolerant mutation ADR 0003 admits (AC-36, AC-11, sad.md §6.7a)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const recipientId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(recipientId, 'recipient@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    await seedMembership(recipientId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(managerId);
    await setWarehouseArchived(warehouseId, now);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      { recipientUserId: recipientId, formerManagerRoleId: replacementRoleId },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({ managerUserId: recipientId });
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer returns 400 access.invalid_manager_transfer when the recipient holds no membership in that Warehouse (AC-36a)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const strangerId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(strangerId, 'stranger@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    // Stranger holds no membership in `warehouseId` at all.
    const cookie = await seedSessionCookie(managerId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      { recipientUserId: strangerId, formerManagerRoleId: replacementRoleId },
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'access.invalid_manager_transfer' });

    const managerMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: managerId, warehouseId });
    expect(managerMembership?.roleKind).toBe('warehouse_manager');
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer returns 400 access.invalid_manager_transfer when the recipient is the outgoing Manager themself (AC-36a)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    const cookie = await seedSessionCookie(managerId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      { recipientUserId: managerId, formerManagerRoleId: replacementRoleId },
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'access.invalid_manager_transfer' });

    const managerMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: managerId, warehouseId });
    expect(managerMembership?.roleKind).toBe('warehouse_manager');
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer returns 400 access.invalid_manager_transfer when no custom Role of that Warehouse is selected for the outgoing Manager (AC-36a)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const recipientId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(recipientId, 'recipient@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    await seedMembership(recipientId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(managerId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      // `otherWarehouseRoleId` belongs to `otherWarehouseId`, not the named Warehouse, so it is not
      // a valid custom Role selection for the outgoing Manager here.
      {
        recipientUserId: recipientId,
        formerManagerRoleId: otherWarehouseRoleId,
      },
    );

    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'access.invalid_manager_transfer' });

    const managerMembership = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .findOneBy({ userId: managerId, warehouseId });
    expect(managerMembership?.roleKind).toBe('warehouse_manager');
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer maps a concurrent transfer to 409 access.concurrent_change and preserves exactly one Manager (AC-36a)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const recipientId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(recipientId, 'recipient@example.test');
    await seedMembership(
      managerId,
      warehouseId,
      managerRoleId,
      'warehouse_manager',
    );
    await seedMembership(recipientId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(managerId);

    // Two concurrent transfers of the same Manager, racing on the same pessimistic-write locked
    // rows. The one-Manager-per-Warehouse constraint (and the command's post-lock re-check) admits
    // exactly one winner; the loser must see the transfer's stable concurrency error rather than
    // silently double-applying.
    const [first, second] = await Promise.all([
      request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
        cookie,
        {
          recipientUserId: recipientId,
          formerManagerRoleId: replacementRoleId,
        },
      ),
      request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
        cookie,
        { recipientUserId: recipientId, formerManagerRoleId: custodianRoleId },
      ),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    expect(loser.body).toMatchObject({ code: 'access.concurrent_change' });

    const managers = await dataSource.manager
      .getRepository(WarehouseMembershipEntity)
      .find({ where: { warehouseId, roleKind: 'warehouse_manager' } });
    expect(managers).toHaveLength(1);
  });

  it('POST /api/v1/warehouses/:warehouseId/access/manager-transfer returns 403 access.denied when the actor holds no membership in the *named* Warehouse (AC-05)', async () => {
    await seedWarehouseAndRoles();
    const managerId = randomUUID();
    const recipientId = randomUUID();
    await seedIdentity(managerId, 'manager@example.test');
    await seedIdentity(recipientId, 'recipient@example.test');
    // Manager holds Manager role only in `otherWarehouseId`, not in the named `warehouseId`.
    await seedMembership(managerId, otherWarehouseId, otherWarehouseRoleId);
    await seedMembership(recipientId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(managerId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/manager-transfer`,
      cookie,
      { recipientUserId: recipientId, formerManagerRoleId: replacementRoleId },
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.denied' });
  });

  // -- documented failure branches of the re-pathed operations -----------------------------------

  it('POST /api/v1/warehouses/:warehouseId/access/roles rejects an invalid Role name at the schema boundary (400)', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_CREATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/roles`,
      cookie,
      { name: '   ', permissionIds: [] },
    );

    expect(status).toBe(400);
  });

  it('POST /api/v1/warehouses/:warehouseId/access/roles returns 409 access.role_name_conflict for a name already used in that Warehouse', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_CREATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'POST',
      `/api/v1/warehouses/${warehouseId}/access/roles`,
      cookie,
      { name: 'Replacement', permissionIds: [] },
    );

    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'access.role_name_conflict' });
  });

  it('PATCH /api/v1/warehouses/:warehouseId/access/roles/:roleId returns 404 access.target_unavailable for a Role of another Warehouse', async () => {
    await seedWarehouseAndRoles();
    await grantPermissions(custodianRoleId, [ROLES_UPDATE]);
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, warehouseId, custodianRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'PATCH',
      `/api/v1/warehouses/${warehouseId}/access/roles/${otherWarehouseRoleId}`,
      cookie,
      { name: 'Renamed', permissionIds: [] },
    );

    expect(status).toBe(404);
    expect(body).toMatchObject({ code: 'access.target_unavailable' });
  });

  it.each([
    ['GET', 'roles'],
    ['GET', 'permissions'],
    ['GET', 'members'],
  ] as const)(
    '%s /api/v1/warehouses/:warehouseId/access/%s returns 403 access.denied without the required Warehouse Permission',
    async (method, segment) => {
      await seedWarehouseAndRoles();
      // The actor's Role of this Warehouse carries no Permission at all.
      const actorId = randomUUID();
      await seedIdentity(actorId, 'actor@example.test');
      await seedMembership(actorId, warehouseId, custodianRoleId);
      const cookie = await seedSessionCookie(actorId);

      const { status, body } = await request(
        method,
        `/api/v1/warehouses/${warehouseId}/access/${segment}`,
        cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    },
  );

  it('GET /api/v1/warehouses/:warehouseId/access/current returns 403 access.membership_required for a Warehouse the actor is no member of (AC-04)', async () => {
    await seedWarehouseAndRoles();
    const actorId = randomUUID();
    await seedIdentity(actorId, 'actor@example.test');
    await seedMembership(actorId, otherWarehouseId, otherWarehouseRoleId);
    const cookie = await seedSessionCookie(actorId);

    const { status, body } = await request(
      'GET',
      `/api/v1/warehouses/${warehouseId}/access/current`,
      cookie,
    );

    expect(status).toBe(403);
    expect(body).toMatchObject({ code: 'access.membership_required' });
  });

  it('GET /api/v1/warehouses/:warehouseId/access/current returns 401 without a valid session', async () => {
    await seedWarehouseAndRoles();

    const { status } = await request(
      'GET',
      `/api/v1/warehouses/${warehouseId}/access/current`,
      `${AUTH_SESSION_COOKIE}=not-a-real-session`,
    );

    expect(status).toBe(401);
  });

  // T26 DoD: "A request to any of these paths without a warehouseId cannot reach a handler."
  // AC-03a is encoded structurally: `warehouseId` is a required path segment on every
  // warehouse-access route, so a request that omits it (or that still uses the retired
  // `/api/v1/access/*` shape) matches no route at all and never reaches `WarehouseAccessGuard`.
  it.each([
    ['GET', '/api/v1/access/current'],
    ['GET', '/api/v1/access/roles'],
    ['POST', '/api/v1/access/roles'],
    ['GET', '/api/v1/access/permissions'],
    ['GET', '/api/v1/access/members'],
    ['PUT', `/api/v1/access/members/${randomUUID()}/role`],
    ['POST', '/api/v1/access/manager-transfer'],
    ['GET', '/api/v1/warehouses/access/current'],
  ] as const)(
    '%s %s matches no route without a named Warehouse and never reaches a handler',
    async (method, path) => {
      await seedWarehouseAndRoles();
      const actorId = randomUUID();
      await seedIdentity(actorId, 'actor@example.test');
      await seedMembership(
        actorId,
        warehouseId,
        managerRoleId,
        'warehouse_manager',
      );
      const cookie = await seedSessionCookie(actorId);

      const { status } = await request(method, path, cookie);

      expect(status).toBe(404);
    },
  );
});
