import 'reflect-metadata';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { warehouseSchema } from '@warehouser/contracts/workspaces';
import { WorkspacePermissionId } from '@warehouser/shared-types/enums';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WarehouseController } from 'warehouses/rest/controllers/warehouse.controller';
import type { ArchiveWarehouseCommand } from 'warehouses/usecases/commands/archive-warehouse.command';
import type { CreateWarehouseCommand } from 'warehouses/usecases/commands/create-warehouse.command';
import type { RenameWarehouseCommand } from 'warehouses/usecases/commands/rename-warehouse.command';
import type { RestoreWarehouseCommand } from 'warehouses/usecases/commands/restore-warehouse.command';
import type { SetWarehouseDeliveryAddressCommand } from 'warehouses/usecases/commands/set-warehouse-delivery-address.command';
import type { ListWorkspaceWarehousesQuery } from 'warehouses/usecases/queries/list-workspace-warehouses.query';
import type { ReadWarehouseDeliveryAddressQuery } from 'warehouses/usecases/queries/read-warehouse-delivery-address.query';

const id = (suffix: number): string =>
  `00000000-0000-4000-8000-${suffix.toString().padStart(12, '0')}`;

const actorId = id(1);
const workspaceId = id(2);
const roleId = id(3);
const warehouseId = id(10);

const request = (
  permissionId: WorkspacePermissionId,
): WorkspaceAccessRequest => ({
  headers: {},
  user: { userId: actorId },
  workspace: {
    userId: actorId,
    workspaceId,
    workspaceRoleId: roleId,
    workspaceRoleKind: 'custom',
    permissionId,
  },
});

const method = (name: keyof WarehouseController): object =>
  Object.getOwnPropertyDescriptor(WarehouseController.prototype, name)
    ?.value as object;

// T25 DoD — these routes carry a `warehouseId` in their path yet are
// Workspace-scoped: their subject is the Warehouse record, never a resource the
// Warehouse owns (spec.md §1, sad.md §7). The membership-edge half of this
// suite moved with its handlers to
// `access/rest/controllers/warehouse-access.controller.spec.ts` (CH-S3); no
// case was lost, and every handler inventory below narrowed to the four record
// handlers this controller kept (CR-RG-01, "structural assertions").
// eslint-disable-next-line max-lines-per-function -- one suite per controller, with one use-case double per route
describe('WarehouseController', () => {
  const listWarehouses = {
    execute: jest.fn(),
  } as unknown as ListWorkspaceWarehousesQuery;
  const createWarehouse = {
    execute: jest.fn(),
  } as unknown as CreateWarehouseCommand;
  const renameWarehouse = {
    execute: jest.fn(),
  } as unknown as RenameWarehouseCommand;
  const archiveWarehouse = {
    execute: jest.fn(),
  } as unknown as ArchiveWarehouseCommand;
  const restoreWarehouse = {
    execute: jest.fn(),
  } as unknown as RestoreWarehouseCommand;
  // T11/AC-10 — the Warehouse's own Delivery Address, the fifth and sixth
  // routes whose subject is the Warehouse record.
  const readWarehouseDeliveryAddress = {
    execute: jest.fn(),
  } as unknown as ReadWarehouseDeliveryAddressQuery;
  const setWarehouseDeliveryAddress = {
    execute: jest.fn(),
  } as unknown as SetWarehouseDeliveryAddressCommand;

  const controller = new WarehouseController(
    listWarehouses,
    createWarehouse,
    renameWarehouse,
    archiveWarehouse,
    restoreWarehouse,
    readWarehouseDeliveryAddress,
    setWarehouseDeliveryAddress,
  );

  beforeEach(() => jest.clearAllMocks());

  it('exposes every path of openapi.yaml under one Workspace-scoped prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, WarehouseController)).toBe(
      'api/v1/workspace/warehouses',
    );
    expect([
      [
        Reflect.getMetadata(PATH_METADATA, method('listWarehouses')),
        Reflect.getMetadata(METHOD_METADATA, method('listWarehouses')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('createWarehouse')),
        Reflect.getMetadata(METHOD_METADATA, method('createWarehouse')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('renameWarehouse')),
        Reflect.getMetadata(METHOD_METADATA, method('renameWarehouse')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('setWarehouseArchival')),
        Reflect.getMetadata(METHOD_METADATA, method('setWarehouseArchival')),
      ],
      [
        Reflect.getMetadata(
          PATH_METADATA,
          method('readWarehouseDeliveryAddress'),
        ),
        Reflect.getMetadata(
          METHOD_METADATA,
          method('readWarehouseDeliveryAddress'),
        ),
      ],
      [
        Reflect.getMetadata(
          PATH_METADATA,
          method('setWarehouseDeliveryAddress'),
        ),
        Reflect.getMetadata(
          METHOD_METADATA,
          method('setWarehouseDeliveryAddress'),
        ),
      ],
    ]).toEqual([
      ['/', RequestMethod.GET],
      ['/', RequestMethod.POST],
      [':warehouseId', RequestMethod.PATCH],
      [':warehouseId/archival', RequestMethod.PUT],
      [':warehouseId/delivery-address', RequestMethod.GET],
      [':warehouseId/delivery-address', RequestMethod.PUT],
    ]);
  });

  // T25's What — every handler declares its Workspace Permission and
  // resolves authority through the Workspace guard, never the Warehouse
  // guard.
  it.each([
    ['listWarehouses', WorkspacePermissionId.WAREHOUSES_WATCH],
    ['createWarehouse', WorkspacePermissionId.WAREHOUSES_CREATE],
    ['renameWarehouse', WorkspacePermissionId.WAREHOUSES_RENAME],
    ['setWarehouseArchival', WorkspacePermissionId.WAREHOUSES_ARCHIVE],
    [
      'readWarehouseDeliveryAddress',
      WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
    ],
    [
      'setWarehouseDeliveryAddress',
      WorkspacePermissionId.WAREHOUSES_ADDRESS_UPDATE,
    ],
  ] as const)('%s declares its Workspace Permission', (name, permissionId) => {
    expect(
      Reflect.getMetadata(REQUIRED_WORKSPACE_PERMISSION_KEY, method(name)),
    ).toEqual([permissionId]);
    expect(Reflect.getMetadata(GUARDS_METADATA, method(name))).toEqual([
      SessionAuthGuard,
      WorkspaceAccessGuard,
    ]);
  });

  // T25 DoD — "A test proves none of these handlers is reachable through
  // `WarehouseAccessGuard` or declares a Warehouse Permission." Getting the
  // classification wrong is exactly what would silently break AC-11: the
  // Warehouse guard consults archived state, and these operations must not.
  it.each([
    'listWarehouses',
    'createWarehouse',
    'renameWarehouse',
    'setWarehouseArchival',
    'readWarehouseDeliveryAddress',
    'setWarehouseDeliveryAddress',
  ] as const)(
    '%s declares no Warehouse Permission and is never behind WarehouseAccessGuard',
    (name) => {
      expect(
        Reflect.getMetadata(REQUIRED_PERMISSION_KEY, method(name)),
      ).toBeUndefined();
      const guards = Reflect.getMetadata(GUARDS_METADATA, method(name)) as
        unknown[] | undefined;
      expect(guards ?? []).not.toContain(WarehouseAccessGuard);
    },
  );

  it('lists the Workspace Warehouses with their archived state', async () => {
    jest.mocked(listWarehouses.execute).mockResolvedValue([
      { id: warehouseId, name: 'Test Warehouse North', archivedAt: null },
      {
        id: id(11),
        name: 'Test Warehouse South',
        archivedAt: new Date('2026-08-01T09:00:00.000Z'),
      },
    ]);

    await expect(
      controller.listWarehouses(
        request(WorkspacePermissionId.WAREHOUSES_WATCH),
      ),
    ).resolves.toEqual([
      { id: warehouseId, name: 'Test Warehouse North', archivedAt: null },
      {
        id: id(11),
        name: 'Test Warehouse South',
        archivedAt: '2026-08-01T09:00:00.000Z',
      },
    ]);
    expect(listWarehouses.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
    );
  });

  it('creates a Warehouse under WAREHOUSES:CREATE and returns 201', async () => {
    jest.mocked(createWarehouse.execute).mockResolvedValue({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: null,
    });

    await expect(
      controller.createWarehouse(
        request(WorkspacePermissionId.WAREHOUSES_CREATE),
        { name: 'Test Warehouse North' },
      ),
    ).resolves.toEqual({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: null,
    });
    expect(createWarehouse.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { name: 'Test Warehouse North' },
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('createWarehouse')),
    ).toBe(201);
  });

  it('passes the path Warehouse identifier to the rename command', async () => {
    jest.mocked(renameWarehouse.execute).mockResolvedValue({
      id: warehouseId,
      name: 'Renamed Warehouse',
      archivedAt: null,
    });

    await expect(
      controller.renameWarehouse(
        warehouseId,
        request(WorkspacePermissionId.WAREHOUSES_RENAME),
        { name: 'Renamed Warehouse' },
      ),
    ).resolves.toMatchObject({ id: warehouseId, name: 'Renamed Warehouse' });
    expect(renameWarehouse.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { warehouseId, name: 'Renamed Warehouse' },
    );
  });

  // RED for T44/AC-11 — openapi.yaml documents `PATCH .../{warehouseId}` as
  // `200` with the full `Warehouse` body (including `archivedAt`), and the
  // already-shipped web client (`workspace-warehouses-api.ts`)
  // Zod-validates the response against `warehouseSchema`. The handler
  // previously narrowed its return type to `Pick<Warehouse, 'id' | 'name'>`
  // and dropped `archivedAt`, which fails that validation at runtime.
  it('AC-11: returns the full Warehouse body, satisfying the same warehouseSchema the web client validates against', async () => {
    jest.mocked(renameWarehouse.execute).mockResolvedValue({
      id: warehouseId,
      name: 'Renamed Warehouse',
      archivedAt: null,
    });

    const body = await controller.renameWarehouse(
      warehouseId,
      request(WorkspacePermissionId.WAREHOUSES_RENAME),
      { name: 'Renamed Warehouse' },
    );

    expect(body).toEqual({
      id: warehouseId,
      name: 'Renamed Warehouse',
      archivedAt: null,
    });
    expect(warehouseSchema.parse(body)).toEqual(body);
  });

  it('archives a Warehouse when `archived: true` is submitted (AC-11)', async () => {
    jest.mocked(archiveWarehouse.execute).mockResolvedValue({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: new Date('2026-08-01T09:00:00.000Z'),
    });

    await controller.setWarehouseArchival(
      warehouseId,
      request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
      { archived: true },
    );

    expect(archiveWarehouse.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { warehouseId },
    );
    expect(restoreWarehouse.execute).not.toHaveBeenCalled();
  });

  it('restores a Warehouse when `archived: false` is submitted (AC-11)', async () => {
    jest.mocked(restoreWarehouse.execute).mockResolvedValue({
      id: warehouseId,
      name: 'Test Warehouse North',
      archivedAt: null,
    });

    await controller.setWarehouseArchival(
      warehouseId,
      request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
      { archived: false },
    );

    expect(restoreWarehouse.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { warehouseId },
    );
    expect(archiveWarehouse.execute).not.toHaveBeenCalled();
  });

  // RED for T44/AC-11 — openapi.yaml documents `PUT .../archival` as `200`
  // with the full `Warehouse` body, and the already-shipped web client's
  // `setWarehouseArchival: build.mutation<Warehouse, …>`
  // (`workspace-warehouses-api.ts`) Zod-validates the response against
  // `warehouseSchema`. The handler currently answers `204 No Content`
  // (`@HttpCode(HttpStatus.NO_CONTENT)`, `Promise<void>`), which fails that
  // client-side validation at runtime because an empty body cannot satisfy a
  // schema requiring `id`, `name` and `archivedAt`.
  // Each row arranges its own command rather than sharing one mock call: the
  // two results differ in type (`archivedAt: Date` when archiving, the `null`
  // literal when restoring), which a single mock over the union cannot express.
  it.each([
    [
      'archiving',
      true,
      (): void => {
        jest.mocked(archiveWarehouse.execute).mockResolvedValue({
          id: warehouseId,
          name: 'Test Warehouse North',
          archivedAt: new Date('2026-08-01T09:00:00.000Z'),
        });
      },
      restoreWarehouse,
      '2026-08-01T09:00:00.000Z',
    ],
    [
      'restoring',
      false,
      (): void => {
        jest.mocked(restoreWarehouse.execute).mockResolvedValue({
          id: warehouseId,
          name: 'Test Warehouse North',
          archivedAt: null,
        });
      },
      archiveWarehouse,
      null,
    ],
  ] as const)(
    'AC-11: answers 200 with the full Warehouse body when %s, satisfying the same warehouseSchema the web client validates against',
    async (_case, archived, arrange, otherUsecase, expectedArchivedAt) => {
      arrange();

      const body = await controller.setWarehouseArchival(
        warehouseId,
        request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
        { archived },
      );

      expect(body).toEqual({
        id: warehouseId,
        name: 'Test Warehouse North',
        archivedAt: expectedArchivedAt,
      });
      expect(warehouseSchema.parse(body)).toEqual(body);
      expect(otherUsecase.execute).not.toHaveBeenCalled();
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, method('setWarehouseArchival')),
      ).toBe(200);
    },
  );

  // The controller's job at this boundary is the same as the 404 case above:
  // let whatever the use case raises propagate untouched, so the global
  // filter is the single place it is classified. It never inspects, wraps or
  // reclassifies a failure (server-use-case-boundaries.md §3).
  it.each([
    [
      'createWarehouse',
      (): Promise<unknown> =>
        controller.createWarehouse(
          request(WorkspacePermissionId.WAREHOUSES_CREATE),
          { name: 'Test Warehouse North' },
        ),
      createWarehouse,
    ],
    [
      'setWarehouseArchival',
      (): Promise<unknown> =>
        controller.setWarehouseArchival(
          warehouseId,
          request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
          { archived: true },
        ),
      archiveWarehouse,
    ],
  ] as const)(
    '%s propagates an infrastructure failure unchanged',
    async (_name, invoke, usecase) => {
      const failure = new Error('connection terminated');
      jest.mocked(usecase.execute).mockRejectedValue(failure);

      await expect(invoke()).rejects.toBe(failure);
    },
  );

  // The membership handlers' statuses assert themselves in
  // `access/rest/controllers/warehouse-access.controller.spec.ts`, inside the
  // cases that exercise them; this case keeps the record half. Only the handler
  // inventory narrowed (CR-RG-01, "structural assertions").
  it('uses the specified mutation success statuses', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('createWarehouse')),
    ).toBe(201);
  });

  // DoD — no controller on this surface contains business logic: it reaches
  // only use cases, never a repository, a domain service or persistence. The
  // surface is now served by two controllers from two modules under one URL
  // prefix (sad.md §4.5), so this case reads both sources rather than being
  // duplicated: it is a static source scan, the idiom
  // `tests/access/authorization-coverage.spec.mjs` already applies across
  // modules, and never imports the sibling module.
  it('reaches use cases only, never a repository, service or persistence', () => {
    const sources = [
      join(__dirname, 'warehouse.controller.ts'),
      join(
        __dirname,
        '..',
        '..',
        '..',
        'access',
        'rest',
        'controllers',
        'warehouse-access.controller.ts',
      ),
    ].map((filePath) => readFileSync(filePath, 'utf8'));

    sources.forEach((source) => {
      expect(source).not.toMatch(/from\s+['"]shared\/domain\/repositories\//u);
      expect(source).not.toMatch(/from\s+['"]shared\/domain\/entities\//u);
      expect(source).not.toMatch(/from\s+['"]workspaces\/domain\//u);
      expect(source).not.toMatch(/from\s+['"]typeorm['"]/u);
      expect(source).not.toMatch(/\btry\s*\{/u);
    });
  });
});
