import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  demandPressurePanelSchema,
  orderFlowPanelSchema,
  purchasingSpreadPanelSchema,
  receiptReliabilityPanelSchema,
} from '@warehouser/contracts/dashboards';
import {
  PermissionId,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { AppModule } from 'app.module';
import { digestSessionSecret } from 'auth/domain/security/session-secret';
import { AUTH_SESSION_COOKIE } from 'auth/rest/auth-cookie';
import { ZodValidationPipe } from 'nestjs-zod';
import { READ_TOLERANT_KEY } from 'shared/access/archived-tolerant-read.decorator';
import dataSource from 'shared/database/data-source';
import { OBSERVED_PERMISSION_KEY } from 'shared/decorators/observed-permission.decorator';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
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

// T14 RED — the `/api/v1/workspace/dashboard/*` HTTP contract of
// `docs/features/dashboards/contracts/openapi.yaml`, driven over real HTTP against the real Nest
// module graph exactly as the Warehouse sibling
// (`warehouse-dashboard-http-contract.integration.spec.ts`) does. `WorkspaceDashboardController`
// does not exist yet, so every request below is expected to 404 until T14 writes it.
//
// It proves, per endpoint (task DoD, spec.md §5 AC-15/AC-22, sad.md §6.6):
//   - no route names or accepts a Workspace identifier in a path, query or body position;
//   - a Workspace Member **without** the Permission is denied, and the denial carries no Warehouse
//     name, quantity, count or share and says nothing about how many Warehouses the Workspace holds
//     (AC-15);
//   - a Workspace Member holding the Permission and **no** membership in any Warehouse is admitted
//     (AC-22);
//   - a Warehouse Member holding every watch Permission in their own Warehouse and **no** Workspace
//     Role is denied — the level-confusion case the two-level design exists for (AC-22);
//   - `WAREHOUSE_PERFORMANCE:WATCH` is declared by no other handler's metadata in the whole running
//     graph, and appears in exactly one controller source file;
//   - no handler declares `@ArchivedTolerantRead()`, while the four Warehouse handlers still do;
//   - the module carries no `@Transactional()` anywhere.
//
// The denial status is derived from the filter, not from `openapi.yaml`:
// `WorkspaceAccessGuard` raises `workspaceDeniedError()` (`shared/access/access-denial.errors.ts`),
// whose `ErrorCode.WORKSPACE_DENIED` is mapped by
// `shared/errors/global-http-exception.filter.ts` to **403** with the envelope asserted below.

const now = new Date('2026-09-21T09:00:00.000Z');

const workspaceId = '00000000-0000-4000-8000-000000000900';
// Never accepted anywhere: offered as a query parameter below to prove the surface ignores it.
const foreignWorkspaceId = '00000000-0000-4000-8000-000000000999';
const northWarehouseId = '00000000-0000-4000-8000-000000000901';
const southWarehouseId = '00000000-0000-4000-8000-000000000902';
const archivedWarehouseId = '00000000-0000-4000-8000-000000000903';

// Seeded as real values behind the reads, so "the denial discloses nothing" is asserted over facts
// that genuinely exist rather than over an absence the fixture arranged (AC-15).
const WAREHOUSE_CANARY = 'Warehouse Canary North';
const OUTSTANDING_CANARY = 9137;

const WATCH_PERMISSIONS = [
  PermissionId.ITEMS_WATCH,
  PermissionId.CUSTOMER_ORDERS_WATCH,
  PermissionId.PURCHASE_DRAFTS_WATCH,
  PermissionId.REJECTIONS_WATCH,
] as const;

// Workspace Permissions that are emphatically *not* the one this surface requires: an actor holding
// these is a Workspace Member in good standing whose Role simply does not carry the observation
// Permission (AC-15).
const OTHER_WORKSPACE_PERMISSIONS = [
  WorkspacePermissionId.WAREHOUSES_WATCH,
  WorkspacePermissionId.WORKSPACE_MEMBERS_WATCH,
] as const;

const PANELS = [
  { panel: 'demand-pressure', schema: demandPressurePanelSchema },
  { panel: 'order-flow', schema: orderFlowPanelSchema },
  { panel: 'purchasing-spread', schema: purchasingSpreadPanelSchema },
  { panel: 'receipt-reliability', schema: receiptReliabilityPanelSchema },
] as const;

const WORKSPACE_DENIED = {
  code: 'workspace.denied',
  message: 'Access is not permitted.',
} as const;

const SERVER_SOURCE_ROOT = resolve(import.meta.dirname, '../../..');

interface HttpResponse {
  readonly status: number;
  readonly body: unknown;
  readonly text: string;
}

interface Actor {
  readonly userId: string;
  readonly cookie: string;
}

type RouteHandler = (...args: readonly unknown[]) => unknown;
type ControllerClass = new (...args: readonly never[]) => object;

interface DiscoveredHandler {
  readonly controller: ControllerClass;
  readonly name: string;
  readonly handler: RouteHandler;
}

let app: INestApplication;
let baseUrl: string;
let discovery: DiscoveryService;

const panelPath = (panel: string): string =>
  `/api/v1/workspace/dashboard/${panel}`;

const request = async (
  method: string,
  path: string,
  cookie: string,
): Promise<HttpResponse> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : undefined,
    text,
  };
};

const metadataOf = (target: object, key: string): string =>
  String(Reflect.getMetadata(key, target) ?? '');

const prototypeMethods = (controller: ControllerClass): DiscoveredHandler[] =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => ({
      controller,
      name,
      handler: (controller.prototype as Record<string, unknown>)[
        name
      ] as RouteHandler,
    }))
    .filter(({ handler }) => typeof handler === 'function');

const routeOf = ({ controller, handler }: DiscoveredHandler): string =>
  `${metadataOf(controller, PATH_METADATA)}/${metadataOf(handler, PATH_METADATA)}`;

const everyRouteHandler = (): DiscoveredHandler[] =>
  discovery.getControllers().flatMap((wrapper) => {
    const controller = wrapper.metatype as ControllerClass | undefined;
    return controller === undefined ? [] : prototypeMethods(controller);
  });

/** Every handler serving the Workspace Dashboard prefix, located through the running module graph
 * rather than by importing the controller — so the suite loads (and fails on HTTP) before T14
 * writes that file. */
const workspaceDashboardHandlers = (): DiscoveredHandler[] =>
  everyRouteHandler().filter((entry) =>
    routeOf(entry).includes('workspace/dashboard'),
  );

const warehouseDashboardHandlers = (): DiscoveredHandler[] =>
  everyRouteHandler().filter((entry) => {
    const route = routeOf(entry);
    return route.includes('warehouses') && route.includes('dashboard');
  });

const declaredWorkspacePermissions = (handler: RouteHandler): string[] =>
  (Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, handler) ??
    []) as string[];

const routeArgumentKeys = ({ controller, name }: DiscoveredHandler): string[] =>
  Object.keys(
    (Reflect.getMetadata('__routeArguments__', controller, name) ??
      {}) as Record<string, unknown>,
  );

const sourceFilesUnder = (directory: string, suffix: string): string[] =>
  readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith(suffix))
    .map((entry) => join(directory, entry));

const filesContaining = (paths: readonly string[], needle: string): string[] =>
  paths.filter((path) => readFileSync(path, 'utf8').includes(needle));

const grantWorkspacePermissions = async (
  workspaceRoleId: string,
  permissionIds: readonly string[],
): Promise<void> => {
  if (permissionIds.length === 0) {
    return;
  }
  await dataSource.manager.getRepository(WorkspacePermissionEntity).upsert(
    permissionIds.map((id) => ({
      id,
      label: id,
      kind: 'assignable' as const,
      createdAt: now,
      updatedAt: now,
    })),
    ['id'],
  );
  await dataSource.manager.getRepository(WorkspaceRolePermissionEntity).insert(
    permissionIds.map((workspacePermissionId) => ({
      workspaceRoleId,
      workspacePermissionId,
      workspaceRoleKind: 'custom' as const,
      workspacePermissionKind: 'assignable' as const,
    })),
  );
};

const grantWarehousePermissions = async (
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

/** Two active Warehouses and one the Workspace has archived — the population every Workspace Panel
 * reports over, and the facts AC-15's denial may not disclose. */
const seedWorkspace = async (): Promise<void> => {
  await dataSource.manager.getRepository(WorkspaceEntity).insert({
    id: workspaceId,
    name: 'Test Workspace',
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(WarehouseEntity).insert([
    {
      id: northWarehouseId,
      workspaceId,
      name: WAREHOUSE_CANARY,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: southWarehouseId,
      workspaceId,
      name: 'Warehouse South',
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: archivedWarehouseId,
      workspaceId,
      name: 'Warehouse Retired',
      archivedAt: now,
      createdAt: now,
      updatedAt: now,
    },
  ]);
};

// `accounts.user_id` / `users.account_id` form a deferred circular FK pair, so both inserts must
// run inside one transaction.
const seedIdentity = async (userId: string): Promise<void> => {
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

/** A Workspace Member whose own Workspace Role carries exactly `permissionIds`, and who holds **no**
 * membership in any Warehouse of the Workspace (AC-22). Each actor gets a Role of its own, so two
 * actors with different Permission sets never collide on `workspace_role_permissions`. */
const seedWorkspaceActor = async (
  permissionIds: readonly string[],
): Promise<Actor> => {
  const userId = randomUUID();
  const workspaceRoleId = randomUUID();
  await seedIdentity(userId);
  await dataSource.manager.getRepository(WorkspaceRoleEntity).insert({
    id: workspaceRoleId,
    workspaceId,
    name: `Role ${workspaceRoleId}`,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  await grantWorkspacePermissions(workspaceRoleId, permissionIds);
  await dataSource.manager.getRepository(WorkspaceMembershipEntity).insert({
    userId,
    workspaceId,
    workspaceRoleId,
    workspaceRoleKind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  return { userId, cookie: await seedSessionCookie(userId) };
};

/** A Warehouse Member holding every watch Permission in their own Warehouse and **no** Workspace
 * Role at all — the level-confusion case of AC-22. Their Role, too, is their own. */
const seedWarehouseOnlyActor = async (): Promise<Actor> => {
  const userId = randomUUID();
  const roleId = randomUUID();
  await seedIdentity(userId);
  await dataSource.manager.getRepository(RoleEntity).insert({
    id: roleId,
    warehouseId: northWarehouseId,
    name: `Supervisor ${roleId}`,
    kind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  await grantWarehousePermissions(roleId, WATCH_PERMISSIONS);
  await dataSource.manager.getRepository(WarehouseMembershipEntity).insert({
    userId,
    warehouseId: northWarehouseId,
    workspaceId,
    roleId,
    roleKind: 'custom',
    createdAt: now,
    updatedAt: now,
  });
  return { userId, cookie: await seedSessionCookie(userId) };
};

/** One Item and one Unfulfilled Customer Order owing `OUTSTANDING_CANARY` in the canary Warehouse,
 * so the Workspace demonstrably has something outstanding while a denial is being inspected. */
const seedOutstandingDemand = async (
  recordedByUserId: string,
): Promise<void> => {
  const itemId = randomUUID();
  await dataSource.manager.getRepository(ItemEntity).insert({
    id: itemId,
    warehouseId: northWarehouseId,
    sku: 'TEST-SKU-0900',
    description: 'Cable reel, 50m',
    unitOfMeasure: 'each',
    onHandQuantity: 40,
    deactivatedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await dataSource.manager.getRepository(CustomerOrderEntity).insert({
    id: randomUUID(),
    warehouseId: northWarehouseId,
    itemId,
    customerName: 'Acme Logistics',
    quantity: OUTSTANDING_CANARY,
    outstandingQuantity: OUTSTANDING_CANARY,
    neededBy: '2026-10-01',
    state: 'unfulfilled',
    cancellationReason: null,
    recordedByUserId,
    cancelledByUserId: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  });
};

/** The AC-22 admission starting point: the Permission held in the Workspace, no Warehouse
 * membership anywhere, and a Workspace that genuinely holds records. */
const seedAdmittedActor = async (): Promise<Actor> => {
  await seedWorkspace();
  const actor = await seedWorkspaceActor([
    WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
  ]);
  await seedOutstandingDemand(actor.userId);
  return actor;
};

const setupHarness = (): void => {
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ZodValidationPipe());
    app.useGlobalFilters(new GlobalHttpExceptionFilter());
    await app.init();
    await app.listen(0);

    const address = (app.getHttpServer() as Server).address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    discovery = app.get(DiscoveryService);

    await dataSource.initialize();
  });

  afterEach(async () => {
    await dataSource.query(
      'TRUNCATE customer_orders, items, workspace_role_permissions, workspace_memberships, workspace_roles, workspace_permissions, warehouse_memberships, role_permissions, roles, warehouses, sessions, users, accounts, permissions, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });
};

// AC-22 — the authority is held in the Workspace and is not assembled from memberships below it, so
// a holder with no Warehouse membership at all reads every Panel.
const registerAdmissionTests = (): void => {
  it.each(PANELS)(
    'admits $panel for a Permission holder with no Warehouse membership (AC-22)',
    async ({ panel, schema }) => {
      const actor = await seedAdmittedActor();

      const { status, body } = await request(
        'GET',
        panelPath(panel),
        actor.cookie,
      );

      expect(status).toBe(200);
      expect(() => schema.parse(body)).not.toThrow();
    },
  );
};

// AC-15 — the denial is the single non-enumerating `workspace.denied` the filter maps to 403, and
// it discloses no Warehouse name, no quantity, no count and no share: the actor below holds other
// Workspace Permissions, so nothing but the missing observation Permission can be what refused, and
// the response is byte-identical to the one a member holding nothing receives.
const registerDenialTests = (): void => {
  it.each(PANELS)(
    'denies $panel to a Workspace Member whose Role lacks the Permission (AC-15)',
    async ({ panel }) => {
      await seedWorkspace();
      const actor = await seedWorkspaceActor(OTHER_WORKSPACE_PERMISSIONS);
      await seedOutstandingDemand(actor.userId);
      const stranger = await seedWorkspaceActor([]);

      const refused = await request('GET', panelPath(panel), actor.cookie);
      const baseline = await request('GET', panelPath(panel), stranger.cookie);

      expect(refused.status).toBe(403);
      expect(refused.body).toEqual(WORKSPACE_DENIED);
      expect(refused.status).toBe(baseline.status);
      expect(refused.text).toBe(baseline.text);
    },
  );

  it.each(PANELS)(
    'discloses no Warehouse name, quantity or count in the $panel denial (AC-15)',
    async ({ panel }) => {
      await seedWorkspace();
      const actor = await seedWorkspaceActor(OTHER_WORKSPACE_PERMISSIONS);
      await seedOutstandingDemand(actor.userId);

      const { status, text } = await request(
        'GET',
        panelPath(panel),
        actor.cookie,
      );

      expect(status).toBe(403);
      expect(text).not.toContain(WAREHOUSE_CANARY);
      expect(text).not.toContain(String(OUTSTANDING_CANARY));
      expect(text).not.toContain('archivedWarehouseCount');
      expect(text).not.toContain('warehouse');
      // No figure of any kind: a count, a quantity or a share would all be digits, and the denial
      // carries none — so it says nothing about how many Warehouses the Workspace holds or whether
      // any of them has anything outstanding.
      expect(text).not.toMatch(/\d/u);
    },
  );

  it.each(PANELS)(
    'denies $panel to a Warehouse Member holding every watch Permission and no Workspace Role (AC-22)',
    async ({ panel }) => {
      await seedWorkspace();
      const actor = await seedWarehouseOnlyActor();
      await seedOutstandingDemand(actor.userId);

      const { status, body } = await request(
        'GET',
        panelPath(panel),
        actor.cookie,
      );

      // The two levels never meet: a Warehouse Permission resolves nothing against the Workspace
      // metadata key this surface declares (server-request-authorization.md § "The stage").
      expect(status).toBe(403);
      expect(body).toEqual(WORKSPACE_DENIED);
    },
  );
};

// DoD — no route names or accepts a Workspace identifier in a path, query or body position, and
// every handler is a bodyless GET.
const registerRouteShapeTests = (): void => {
  it('serves exactly the four Panels of the contract, each a bodyless GET', () => {
    const handlers = workspaceDashboardHandlers();

    expect(handlers).toHaveLength(PANELS.length);
    expect(
      handlers.map((entry) => metadataOf(entry.handler, PATH_METADATA)).sort(),
    ).toEqual(PANELS.map(({ panel }) => panel).toSorted());
    handlers.forEach((entry) => {
      expect(Reflect.getMetadata(METHOD_METADATA, entry.handler)).toBe(
        RequestMethod.GET,
      );
      // `3:` body, `4:` query, `5:` route parameter — none may appear on any handler.
      const bound = routeArgumentKeys(entry).filter((key) =>
        ['3:', '4:', '5:'].some((paramtype) => key.startsWith(paramtype)),
      );
      expect(bound).toEqual([]);
    });
  });

  it('names no identifier in any route segment', () => {
    const handlers = workspaceDashboardHandlers();

    expect(handlers).toHaveLength(PANELS.length);
    handlers.forEach((entry) => {
      expect(routeOf(entry)).not.toContain(':');
    });
  });

  it.each(PANELS)(
    'ignores a Workspace identifier offered as a query parameter on $panel',
    async ({ panel }) => {
      const actor = await seedAdmittedActor();

      const plain = await request('GET', panelPath(panel), actor.cookie);
      const withForeignId = await request(
        'GET',
        `${panelPath(panel)}?workspaceId=${foreignWorkspaceId}`,
        actor.cookie,
      );

      expect(plain.status).toBe(200);
      expect(withForeignId.status).toBe(200);
      expect(withForeignId.body).toEqual(plain.body);
    },
  );
};

// DoD — the Workspace surface scopes itself to active Warehouses inside the query rather than
// tolerating an archived target, so none of its handlers declares read tolerance; the Warehouse
// sibling's four still do, and that count must stay true.
const registerArchivedToleranceTests = (): void => {
  it('declares no archived-tolerant read on the Workspace surface', () => {
    const handlers = workspaceDashboardHandlers();

    expect(handlers).toHaveLength(PANELS.length);
    handlers.forEach((entry) => {
      expect(
        Reflect.getMetadata(READ_TOLERANT_KEY, entry.handler),
      ).toBeUndefined();
    });
  });

  it('leaves the four archived-tolerant Warehouse handlers as they are', () => {
    const tolerant = warehouseDashboardHandlers().filter(
      (entry) => Reflect.getMetadata(READ_TOLERANT_KEY, entry.handler) === true,
    );

    expect(tolerant).toHaveLength(4);
  });
};

// DoD — the new Permission admits this surface and nothing else, asserted both over the running
// graph's metadata and over the controller sources themselves.
const registerPermissionExclusivityTests = (): void => {
  it('declares the observation Permission on all four handlers and on no other', () => {
    const declaring = everyRouteHandler().filter((entry) =>
      declaredWorkspacePermissions(entry.handler).includes(
        WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
      ),
    );

    expect(declaring).toHaveLength(PANELS.length);
    expect(
      declaring
        .map(routeOf)
        .every((route) => route.includes('workspace/dashboard')),
    ).toBe(true);
  });

  it('declares the Permission exactly once per handler and mixes in no Warehouse vocabulary', () => {
    const handlers = workspaceDashboardHandlers();

    expect(handlers).toHaveLength(PANELS.length);
    handlers.forEach(({ handler }) => {
      expect(declaredWorkspacePermissions(handler)).toEqual([
        WorkspacePermissionId.WAREHOUSE_PERFORMANCE_WATCH,
      ]);
      // A Warehouse Permission on a Workspace-guarded handler resolves nothing and would be a
      // silent no-op, so neither key may appear here.
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, handler),
      ).toBeUndefined();
      expect(
        Reflect.getMetadata(OBSERVED_PERMISSION_KEY, handler),
      ).toBeUndefined();
    });
  });

  it('names the Permission in exactly one controller source file', () => {
    const controllers = sourceFilesUnder(SERVER_SOURCE_ROOT, '.controller.ts');

    expect(
      filesContaining(controllers, 'WAREHOUSE_PERFORMANCE_WATCH').map((path) =>
        path.replace(SERVER_SOURCE_ROOT, ''),
      ),
    ).toEqual([
      '/dashboards/rest/controllers/workspace-dashboard.controller.ts',
    ]);
  });
};

// DoD — these are reads: nothing in the module opens a transaction.
const registerTransactionTests = (): void => {
  it('opens no transaction anywhere in the module', () => {
    // Production sources only: a spec quoting the decorator's name — this one does, three lines
    // below — is not the module opening a transaction.
    const moduleSources = sourceFilesUnder(
      join(SERVER_SOURCE_ROOT, 'dashboards'),
      '.ts',
    ).filter((path) => !path.endsWith('.spec.ts'));

    expect(filesContaining(moduleSources, '@Transactional')).toEqual([]);
  });
};

describe('Workspace Dashboard HTTP contract', () => {
  setupHarness();
  registerAdmissionTests();
  registerDenialTests();
  registerRouteShapeTests();
  registerArchivedToleranceTests();
  registerPermissionExclusivityTests();
  registerTransactionTests();
});
