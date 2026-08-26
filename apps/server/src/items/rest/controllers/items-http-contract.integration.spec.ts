import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import dataSource from 'shared/database/data-source';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
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

// Fixed clock, mirroring `access-http-contract.integration.spec.ts`: `chk_warehouses_archival_order`
// rejects `archivedAt < createdAt`, so every seeded row and every archival timestamp is pinned to
// this one instant.
const now = new Date('2026-08-25T09:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000500';
const warehouseId = '00000000-0000-4000-8000-000000000501';
// A second Warehouse of the same Workspace — used to prove a `sku` conflict and an Item lookup are
// both scoped to the Warehouse named in the path rather than any other Warehouse the actor happens
// to hold a membership in (AC-07a, ItemUnavailable's non-enumerating outcome).
const otherWarehouseId = '00000000-0000-4000-8000-000000000502';

const roleId = '00000000-0000-4000-8000-000000000601';
const otherWarehouseRoleId = '00000000-0000-4000-8000-000000000602';

const ITEMS_WATCH = 'ITEMS:WATCH';
const ITEMS_CREATE = 'ITEMS:CREATE';
const ITEMS_UPDATE = 'ITEMS:UPDATE';
const ITEMS_DEACTIVATE = 'ITEMS:DEACTIVATE';
const ITEM_STOCK_ADJUST = 'ITEM_STOCK:ADJUST';

// T7 DoD — the `/api/v1/warehouses/{warehouseId}/items*` HTTP contract described by
// `contracts/openapi.yaml` (AC-06, AC-06a, AC-06d, AC-08, AC-23). Mirrors the structure of
// `access-http-contract.integration.spec.ts`: one local harness, driven over real HTTP against the
// real Nest module graph, because `ItemsRestModule` does not exist yet — every request below is
// expected to 404 until T7 wires it into `AppModule` (GOOD red).
//
// This spec proves, per endpoint:
//   - denied without the declared Permission, permitted with it;
//   - reads succeed on an archived Warehouse and mutations are denied on one (AC-23);
//   - no denial discloses whether the target exists (a cross-Warehouse Item and a missing one are
//     reported identically).
// eslint-disable-next-line max-lines-per-function -- one HTTP contract suite covering one surface is inherently long, matching the access precedent
describeIntegration('items HTTP contract', () => {
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
      'TRUNCATE items, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const grantPermissions = async (
    targetRoleId: string,
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
        roleId: targetRoleId,
        permissionId,
        roleKind: 'custom' as const,
        permissionKind: 'assignable' as const,
      })),
    );
  };

  const seedWarehouses = async (): Promise<void> => {
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
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherWarehouseId,
        workspaceId,
        name: 'Warehouse B',
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await dataSource.manager.getRepository(RoleEntity).insert([
      {
        id: roleId,
        warehouseId,
        name: 'Custodian',
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
    userRoleId: string,
  ): Promise<void> => {
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId: userWarehouseId,
      workspaceId,
      roleId: userRoleId,
      roleKind: 'custom',
      createdAt: now,
      updatedAt: now,
    });
  };

  const seedSessionCookie = async (accountId: string): Promise<string> => {
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

  /** Seeds a Warehouse Member of `warehouseId` holding exactly `permissionIds`. */
  const seedActor = async (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
    const userId = randomUUID();
    await seedIdentity(userId, `member.${userId}@example.test`);
    if (permissionIds.length > 0) {
      await grantPermissions(roleId, permissionIds);
    }
    await seedMembership(userId, warehouseId, roleId);
    return { userId, cookie: await seedSessionCookie(userId) };
  };

  const seedItem = async (
    overrides: Partial<{
      id: string;
      warehouseId: string;
      sku: string;
      description: string;
      unitOfMeasure: string;
      onHandQuantity: number;
      deactivatedAt: Date | null;
    }> = {},
  ): Promise<string> => {
    const id = overrides.id ?? randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId: overrides.warehouseId ?? warehouseId,
      sku: overrides.sku ?? `TEST-SKU-${id.slice(0, 8)}`,
      description: overrides.description ?? 'Test Item',
      unitOfMeasure: overrides.unitOfMeasure ?? 'pieces',
      onHandQuantity: overrides.onHandQuantity ?? 0,
      deactivatedAt: overrides.deactivatedAt ?? null,
      createdAt: now,
      updatedAt: now,
    });
    return id;
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

  // -- GET /items -- list, archived-tolerant, the AC-06a picker read -------------------------

  describe('GET /api/v1/warehouses/:warehouseId/items', () => {
    it('lists the Warehouse Items with their SKUs (AC-06a)', async () => {
      await seedWarehouses();
      await seedItem({ sku: 'TEST-SKU-0001', description: 'Cable' });
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([
        expect.objectContaining({ sku: 'TEST-SKU-0001', description: 'Cable' }),
      ]);
    });

    it('denies a read to an actor without ITEMS:WATCH', async () => {
      await seedWarehouses();
      const actor = await seedActor([]);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — a member holding ITEMS:WATCH reads an archived Warehouse's Items exactly as before.
    it('still lists Items of an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      await seedItem({ sku: 'TEST-SKU-0001' });
      const actor = await seedActor([ITEMS_WATCH]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'GET',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toEqual([expect.objectContaining({ sku: 'TEST-SKU-0001' })]);
    });
  });

  // -- POST /items -- create, mutating -------------------------------------------------------

  describe('POST /api/v1/warehouses/:warehouseId/items', () => {
    it('creates an Item active with nothing on hand (AC-06)', async () => {
      await seedWarehouses();
      const actor = await seedActor([ITEMS_CREATE]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
        {
          sku: 'TEST-SKU-0003',
          description: 'Pallet-wrapped fitting',
          unitOfMeasure: 'pieces',
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        sku: 'TEST-SKU-0003',
        description: 'Pallet-wrapped fitting',
        unitOfMeasure: 'pieces',
        onHandQuantity: 0,
        deactivatedAt: null,
      });
    });

    it('denies a create to an actor without ITEMS:CREATE', async () => {
      await seedWarehouses();
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
        {
          sku: 'TEST-SKU-0003',
          description: 'Fitting',
          unitOfMeasure: 'pieces',
        },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — creation is mutating and is refused while the Warehouse is archived.
    it('refuses to create an Item on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const actor = await seedActor([ITEMS_CREATE]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items`,
        actor.cookie,
        {
          sku: 'TEST-SKU-0003',
          description: 'Fitting',
          unitOfMeasure: 'pieces',
        },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- PATCH /items/:itemId -- correct, mutating ----------------------------------------------

  describe('PATCH /api/v1/warehouses/:warehouseId/items/:itemId', () => {
    it('corrects an Item description', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ description: 'Old description' });
      const actor = await seedActor([ITEMS_UPDATE]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}`,
        actor.cookie,
        { description: 'New description' },
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: itemId,
        description: 'New description',
      });
    });

    it('denies a correction to an actor without ITEMS:UPDATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}`,
        actor.cookie,
        { description: 'New description' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — correction is mutating and is refused while the Warehouse is archived.
    it('refuses to correct an Item on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEMS_UPDATE]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}`,
        actor.cookie,
        { description: 'New description' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });

    // No denial may disclose existence: a cross-Warehouse Item and a nonexistent one are
    // indistinguishable (openapi.yaml `ItemUnavailable`).
    it('reports a cross-Warehouse Item exactly as a missing one', async () => {
      await seedWarehouses();
      const crossWarehouseItemId = await seedItem({
        warehouseId: otherWarehouseId,
      });
      const actor = await seedActor([ITEMS_UPDATE]);

      const crossWarehouse = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/items/${crossWarehouseItemId}`,
        actor.cookie,
        { description: 'New description' },
      );
      const missing = await request(
        'PATCH',
        `/api/v1/warehouses/${warehouseId}/items/${randomUUID()}`,
        actor.cookie,
        { description: 'New description' },
      );

      expect(crossWarehouse.status).toBe(404);
      expect(crossWarehouse.body).toMatchObject({
        code: 'items.target_unavailable',
      });
      expect(crossWarehouse).toEqual(missing);
    });
  });

  // -- POST /items/:itemId/deactivation -- deactivate, mutating (AC-06d) ----------------------

  describe('POST /api/v1/warehouses/:warehouseId/items/:itemId/deactivation', () => {
    it('deactivates an Item, keeping its SKU taken (AC-06d)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ sku: 'TEST-SKU-0001' });
      const actor = await seedActor([ITEMS_DEACTIVATE]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: itemId,
        sku: 'TEST-SKU-0001',
        deactivatedAt: expect.any(String),
      });
    });

    it('denies a deactivation to an actor without ITEMS:DEACTIVATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — deactivation is mutating and is refused while the Warehouse is archived.
    it('refuses to deactivate an Item on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEMS_DEACTIVATE]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- DELETE /items/:itemId/deactivation -- reactivate, mutating (AC-06d) --------------------

  describe('DELETE /api/v1/warehouses/:warehouseId/items/:itemId/deactivation', () => {
    it('reactivates an already-Inactive Item (AC-06d)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ deactivatedAt: now });
      const actor = await seedActor([ITEMS_DEACTIVATE]);

      const { status, body } = await request(
        'DELETE',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(body).toMatchObject({ id: itemId, deactivatedAt: null });
    });

    it('denies a reactivation to an actor without ITEMS:DEACTIVATE', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ deactivatedAt: now });
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'DELETE',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — reactivation is mutating and is refused while the Warehouse is archived.
    it('refuses to reactivate an Item on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ deactivatedAt: now });
      const actor = await seedActor([ITEMS_DEACTIVATE]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'DELETE',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/deactivation`,
        actor.cookie,
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });

  // -- POST /items/:itemId/on-hand-adjustments -- set the counted figure (AC-08) --------------

  describe('POST /api/v1/warehouses/:warehouseId/items/:itemId/on-hand-adjustments', () => {
    it('records the counted figure, its reason, the acting member and the time (AC-08)', async () => {
      await seedWarehouses();
      const itemId = await seedItem({ onHandQuantity: 0 });
      const actor = await seedActor([ITEM_STOCK_ADJUST]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/on-hand-adjustments`,
        actor.cookie,
        {
          countedQuantity: 12,
          reason: 'Counted after the cancelled collection',
        },
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        itemId,
        countedQuantity: 12,
        reason: 'Counted after the cancelled collection',
        adjustedByUserId: actor.userId,
        createdAt: expect.any(String),
      });
    });

    it('denies an adjustment to an actor without ITEM_STOCK:ADJUST', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEMS_WATCH]);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/on-hand-adjustments`,
        actor.cookie,
        { countedQuantity: 12, reason: 'Recount' },
      );

      expect(status).toBe(403);
      expect(body).toMatchObject({ code: 'access.denied' });
    });

    // AC-23 — setting On-hand Quantity is mutating and is refused while the Warehouse is archived.
    it('refuses to adjust On-hand Quantity on an archived Warehouse (AC-23)', async () => {
      await seedWarehouses();
      const itemId = await seedItem();
      const actor = await seedActor([ITEM_STOCK_ADJUST]);
      await setWarehouseArchived(warehouseId, now);

      const { status, body } = await request(
        'POST',
        `/api/v1/warehouses/${warehouseId}/items/${itemId}/on-hand-adjustments`,
        actor.cookie,
        { countedQuantity: 12, reason: 'Recount' },
      );

      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'access.warehouse_archived' });
    });
  });
});
