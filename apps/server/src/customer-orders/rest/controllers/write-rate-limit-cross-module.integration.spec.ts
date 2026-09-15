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
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter';
import { expectPinnedCounterOnEveryRouteGuard } from 'test/expects/write-rate-limit-wiring';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// ADR 0003 — "60 recorded changes per minute **per member**", not per member per REST module.
//
// This is the regression test for a defect the per-route guard wiring introduced and no single-
// module test could see. `@UseGuards(WriteRateLimitGuard)` names a class, and Nest resolves it
// through `moduleRef.injectables`, minting a separate instance for every module that declares such
// a route — `@Global()` and `exports` do not change that. With the counts held in the guard, a
// member got a fresh 60 in `items` and another 60 in `customer-orders`: 120 writes a minute today
// and more with every module added, silently halving the abuse-case mitigation of spec.md §6.1.
//
// It needs two modules' write surfaces at once, which is why it lives with `customer-orders` rather
// than beside the guard: at the commit that introduced the guard, the second surface did not exist.
const seededAt = new Date('2026-08-25T09:00:00.000Z');
const frozenNow = seededAt.getTime();
const pinnedCounter = new WriteRateLimitCounter(() => frozenNow);

const workspaceId = '00000000-0000-4000-8000-000000000a00';
const warehouseId = '00000000-0000-4000-8000-000000000a01';
const roleId = '00000000-0000-4000-8000-000000000a02';

const maxRecordedChangesPerWindow = 60;

const calendarDaysFromToday = (days: number): string =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('write rate limit across modules', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WriteRateLimitCounter)
      .useValue(pinnedCounter)
      .compile();

    // Both route guards must hold the same pinned counter — the very property under test, and the
    // one the pinned clock also depends on.
    expectPinnedCounterOnEveryRouteGuard(moduleRef, pinnedCounter);

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.listen(0);
    baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}`;

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE arrival_allocations, purchase_draft_demand_snapshots, purchase_draft_line_links, purchase_draft_lines, purchase_drafts, item_stock_adjustments, customer_orders, items, warehouse_memberships, role_permissions, roles, warehouses, workspaces, sessions, users, accounts, permissions CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  const seedActor = async (): Promise<{ userId: string; cookie: string }> => {
    const permissionIds = ['ITEMS:CREATE', 'CUSTOMER_ORDERS:CREATE'];
    await dataSource.manager.getRepository(WorkspaceEntity).insert({
      id: workspaceId,
      name: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(WarehouseEntity).insert({
      id: warehouseId,
      workspaceId,
      name: 'Warehouse A',
      archivedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(RoleEntity).insert({
      id: roleId,
      warehouseId,
      name: 'Custodian',
      kind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    await dataSource.manager.getRepository(PermissionEntity).upsert(
      permissionIds.map((id) => ({
        id,
        label: id,
        kind: 'assignable' as const,
        createdAt: seededAt,
        updatedAt: seededAt,
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

    const userId = randomUUID();
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AccountEntity).insert({
        id: userId,
        userId,
        normalizedEmail: `member.${userId}@example.test`,
        passwordHash: 'synthetic-hash',
        passwordHashAlgorithm: 'scrypt',
        passwordHashParameters: { cost: 1_024 },
        createdAt: seededAt,
        updatedAt: seededAt,
      });
      await manager.getRepository(UserEntity).insert({
        id: userId,
        accountId: userId,
        workspaceId,
        createdAt: seededAt,
        updatedAt: seededAt,
      });
    });
    await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
      userId,
      warehouseId,
      workspaceId,
      roleId,
      roleKind: 'custom',
      createdAt: seededAt,
      updatedAt: seededAt,
    });

    const secret = randomUUID();
    const establishedAt = new Date();
    await dataSource.manager.getRepository(SessionEntity).insert({
      id: randomUUID(),
      accountId: userId,
      secretDigest: digestSessionSecret(secret),
      establishedAt,
      expiresAt: new Date(establishedAt.getTime() + 60 * 60 * 1000),
      revokedAt: null,
    });

    return { userId, cookie: `${AUTH_SESSION_COOKIE}=${secret}` };
  };

  const seedItem = async (): Promise<string> => {
    const id = randomUUID();
    await dataSource.manager.getRepository(ItemEntity).insert({
      id,
      warehouseId,
      sku: `TEST-SKU-SEED-${id.slice(0, 8)}`,
      description: 'Test Item',
      unitOfMeasure: 'pieces',
      onHandQuantity: 0,
      deactivatedAt: null,
      createdAt: seededAt,
      updatedAt: seededAt,
    });
    return id;
  };

  /** `POST /items` — a `@WriteRateLimited()` route owned by the `items` module. */
  const createItem = async (
    cookie: string,
    attempt: number,
  ): Promise<number> => {
    const response = await fetch(
      `${baseUrl}/api/v1/warehouses/${warehouseId}/items`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          sku: `TEST-SKU-${attempt.toString().padStart(4, '0')}`,
          description: 'Test Item',
          unitOfMeasure: 'pieces',
        }),
      },
    );
    return response.status;
  };

  /** `POST /customer-orders` — a `@WriteRateLimited()` route owned by `customer-orders`. */
  const recordDemand = async (
    cookie: string,
    itemId: string,
  ): Promise<{ status: number; body: unknown }> => {
    const response = await fetch(
      `${baseUrl}/api/v1/warehouses/${warehouseId}/customer-orders`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          itemId,
          customerName: 'Test Customer North',
          quantity: 100,
          neededBy: calendarDaysFromToday(30),
        }),
      },
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  it('counts one window across both modules: exhausting it on items refuses the next customer-order write', async () => {
    const actor = await seedActor();
    const itemId = await seedItem();

    const itemStatuses: number[] = [];
    for (let attempt = 0; attempt < maxRecordedChangesPerWindow; attempt += 1) {
      itemStatuses.push(await createItem(actor.cookie, attempt));
    }
    const demandAfterItemsExhaustedTheWindow = await recordDemand(
      actor.cookie,
      itemId,
    );

    expect(itemStatuses.every((status) => status === 201)).toBe(true);
    // Per-module counters would have let this through as a 201 with a fresh allowance of 60.
    expect(demandAfterItemsExhaustedTheWindow.status).toBe(429);
    expect(demandAfterItemsExhaustedTheWindow.body).toMatchObject({
      code: 'access.write_rate_limited',
    });
  }, 60_000);

  it('counts the same window in the other direction too', async () => {
    const actor = await seedActor();
    const itemId = await seedItem();

    const demandStatuses: number[] = [];
    for (let attempt = 0; attempt < maxRecordedChangesPerWindow; attempt += 1) {
      demandStatuses.push((await recordDemand(actor.cookie, itemId)).status);
    }
    const itemAfterDemandExhaustedTheWindow = await createItem(actor.cookie, 0);

    expect(demandStatuses.every((status) => status === 201)).toBe(true);
    expect(itemAfterDemandExhaustedTheWindow).toBe(429);
  }, 60_000);
});
