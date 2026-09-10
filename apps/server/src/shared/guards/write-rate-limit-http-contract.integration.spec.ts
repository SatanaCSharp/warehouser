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
import { WriteRateLimitCounter } from 'shared/guards/write-rate-limit.counter.js';
import { expectPinnedCounterOnEveryRouteGuard } from 'test/expects/write-rate-limit-wiring.js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// ADR 0003 / spec.md §6.1 "Draft and demand spam" — the per-member write rate limit as it behaves
// over real HTTP, driven against the `items` write surface this guard shipped alongside.
// `write-rate-limit.guard.spec.ts` proves the counter in isolation; what it cannot prove is that
// the guard is wired to a running route at all. It was not: the guard existed and mutating handlers
// carried `@WriteRateLimited()`, but nothing constructed it, so the declared limit enforced nothing
// and openapi's documented 429 branch was unreachable.
const seededAt = new Date('2026-08-25T09:00:00.000Z');
// The window is pinned for the whole file. On the real clock, `Math.floor(Date.now() / 60_000)`
// advances mid-suite whenever a run straddles a wall-clock minute, silently resetting the counter
// so the 61st request returns 201 — red at random, and unreproducible.
const frozenNow = seededAt.getTime();
const pinnedCounter = new WriteRateLimitCounter(() => frozenNow);

const workspaceId = '00000000-0000-4000-8000-000000000900';
const warehouseId = '00000000-0000-4000-8000-000000000901';
const roleId = '00000000-0000-4000-8000-000000000902';

const maxRecordedChangesPerWindow = 60;

describe('write rate limit over HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WriteRateLimitCounter)
      .useValue(pinnedCounter)
      .compile();

    // The override must reach the counter the *routes* use, not merely the container's copy. An
    // earlier attempt overrode `WriteRateLimitGuard` itself and silently did nothing, because a
    // guard named in `@UseGuards(...)` is a per-module injectable and `overrideProvider` only
    // replaces providers. Asserting it here is what keeps the pinned clock from becoming inert
    // again without anyone noticing.
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

  const seedActor = async (
    permissionIds: readonly string[],
  ): Promise<{ userId: string; cookie: string }> => {
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

  /** One `POST /items` — a `@WriteRateLimited()` route of the surface this guard shipped with.
   * Each call uses a fresh SKU so nothing but the limit can refuse it. */
  const createItem = async (
    cookie: string,
    attempt: number,
  ): Promise<{ status: number; body: unknown }> => {
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
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : undefined,
    };
  };

  it('accepts 60 recorded changes in the window and refuses the 61st with 429', async () => {
    const actor = await seedActor(['ITEMS:CREATE']);

    const statuses: number[] = [];
    for (let attempt = 0; attempt < maxRecordedChangesPerWindow; attempt += 1) {
      statuses.push((await createItem(actor.cookie, attempt)).status);
    }
    const overTheLimit = await createItem(
      actor.cookie,
      maxRecordedChangesPerWindow,
    );

    expect(statuses.every((status) => status === 201)).toBe(true);
    expect(overTheLimit.status).toBe(429);
    expect(overTheLimit.body).toMatchObject({
      code: 'access.write_rate_limited',
    });
  }, 60_000);

  // The refusal must reveal nothing member-, Warehouse- or count-specific (spec.md §6.1): a member
  // must not be able to read their own remaining budget, or anyone else's activity, out of it.
  it('discloses no member, Warehouse or count in the refusal', async () => {
    const actor = await seedActor(['ITEMS:CREATE']);

    for (let attempt = 0; attempt < maxRecordedChangesPerWindow; attempt += 1) {
      await createItem(actor.cookie, attempt);
    }
    const overTheLimit = await createItem(
      actor.cookie,
      maxRecordedChangesPerWindow,
    );

    const serialized = JSON.stringify(overTheLimit.body);
    expect(serialized).not.toContain(actor.userId);
    expect(serialized).not.toContain(warehouseId);
    expect(serialized).not.toContain(String(maxRecordedChangesPerWindow));
  }, 60_000);

  // ADR 0003's composition requirement, observable end to end: an actor without the Permission is
  // refused by `WarehouseAccessGuard` and never reaches the counter, so no number of attempts can
  // turn their denial into a rate-limit refusal that would confirm the route does something.
  it('refuses an unauthorized actor by the access guard, never by the counter', async () => {
    const actor = await seedActor(['ITEMS:WATCH']);

    const statuses: number[] = [];
    for (
      let attempt = 0;
      attempt <= maxRecordedChangesPerWindow;
      attempt += 1
    ) {
      statuses.push((await createItem(actor.cookie, attempt)).status);
    }

    expect(statuses.every((status) => status === 403)).toBe(true);
  }, 60_000);
});
