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
import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { REQUIRED_PERMISSION_KEY } from 'shared/decorators/required-permission.decorator';
import { REQUIRED_WORKSPACE_PERMISSION_KEY } from 'shared/decorators/required-workspace-permission.decorator';
import { SessionAuthGuard } from 'shared/guards/session-auth.guard';
import { WarehouseAccessGuard } from 'shared/guards/warehouse-access.guard';
import { WorkspaceAccessGuard } from 'shared/guards/workspace-access.guard';
import { WarehouseController } from 'workspaces/rest/controllers/warehouse.controller';
import type { ArchiveWarehouseCommand } from 'workspaces/usecases/commands/archive-warehouse.command';
import type { AssignWarehouseMembershipCommand } from 'workspaces/usecases/commands/assign-warehouse-membership.command';
import type { CreateWarehouseCommand } from 'workspaces/usecases/commands/create-warehouse.command';
import type { RenameWarehouseCommand } from 'workspaces/usecases/commands/rename-warehouse.command';
import type { RestoreWarehouseCommand } from 'workspaces/usecases/commands/restore-warehouse.command';
import type { RevokeWarehouseMembershipCommand } from 'workspaces/usecases/commands/revoke-warehouse-membership.command';
import type { ListAssignableWarehouseRolesQuery } from 'workspaces/usecases/queries/list-assignable-warehouse-roles.query';
import type { ListWorkspaceWarehousesQuery } from 'workspaces/usecases/queries/list-workspace-warehouses.query';

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
// Workspace-scoped: their subject is the Warehouse record or a membership
// edge into it, never a resource the Warehouse owns (spec.md §1, sad.md §7).
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
  const listAssignableRoles = {
    execute: jest.fn(),
  } as unknown as ListAssignableWarehouseRolesQuery;
  const assignMembership = {
    execute: jest.fn(),
  } as unknown as AssignWarehouseMembershipCommand;
  const revokeMembership = {
    execute: jest.fn(),
  } as unknown as RevokeWarehouseMembershipCommand;

  const controller = new WarehouseController(
    listWarehouses,
    createWarehouse,
    renameWarehouse,
    archiveWarehouse,
    restoreWarehouse,
    listAssignableRoles,
    assignMembership,
    revokeMembership,
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
        Reflect.getMetadata(PATH_METADATA, method('listAssignableRoles')),
        Reflect.getMetadata(METHOD_METADATA, method('listAssignableRoles')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('assignMembership')),
        Reflect.getMetadata(METHOD_METADATA, method('assignMembership')),
      ],
      [
        Reflect.getMetadata(PATH_METADATA, method('revokeMembership')),
        Reflect.getMetadata(METHOD_METADATA, method('revokeMembership')),
      ],
    ]).toEqual([
      ['/', RequestMethod.GET],
      ['/', RequestMethod.POST],
      [':warehouseId', RequestMethod.PATCH],
      [':warehouseId/archival', RequestMethod.PUT],
      [':warehouseId/assignable-roles', RequestMethod.GET],
      [':warehouseId/memberships', RequestMethod.POST],
      [':warehouseId/memberships/:userId', RequestMethod.DELETE],
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
    ['listAssignableRoles', WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN],
    ['assignMembership', WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN],
    ['revokeMembership', WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE],
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
    'listAssignableRoles',
    'assignMembership',
    'revokeMembership',
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
  it.each([
    [
      'archiving',
      true,
      archiveWarehouse,
      restoreWarehouse,
      new Date('2026-08-01T09:00:00.000Z'),
    ],
    ['restoring', false, restoreWarehouse, archiveWarehouse, null],
  ] as const)(
    'AC-11: answers 200 with the full Warehouse body when %s, satisfying the same warehouseSchema the web client validates against',
    async (_case, archived, usecase, otherUsecase, archivedAt) => {
      jest.mocked(usecase.execute).mockResolvedValue({
        id: warehouseId,
        name: 'Test Warehouse North',
        archivedAt,
      });

      const body = await controller.setWarehouseArchival(
        warehouseId,
        request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
        { archived },
      );

      expect(body).toEqual({
        id: warehouseId,
        name: 'Test Warehouse North',
        archivedAt: archivedAt?.toISOString() ?? null,
      });
      expect(warehouseSchema.parse(body)).toEqual(body);
      expect(otherUsecase.execute).not.toHaveBeenCalled();
      expect(
        Reflect.getMetadata(HTTP_CODE_METADATA, method('setWarehouseArchival')),
      ).toBe(200);
    },
  );

  it('returns only identifiers and names of assignable Roles (AC-23a)', async () => {
    jest.mocked(listAssignableRoles.execute).mockResolvedValue([
      { id: id(22), name: 'Picker' },
      { id: id(23), name: 'Site Supervisor' },
    ]);

    await expect(
      controller.listAssignableRoles(
        warehouseId,
        request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN),
      ),
    ).resolves.toEqual([
      { id: id(22), name: 'Picker' },
      { id: id(23), name: 'Site Supervisor' },
    ]);
    expect(listAssignableRoles.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { warehouseId },
    );
  });

  it('assigns a Warehouse membership and returns 201 (AC-23)', async () => {
    jest.mocked(assignMembership.execute).mockResolvedValue({
      userId: id(4),
      warehouseId,
      roleId: id(22),
      roleKind: 'custom',
    });

    await expect(
      controller.assignMembership(
        warehouseId,
        request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN),
        { userId: id(4), roleId: id(22) },
      ),
    ).resolves.toEqual({
      userId: id(4),
      warehouseId,
      roleId: id(22),
      roleKind: 'custom',
    });
    expect(assignMembership.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { targetUserId: id(4), warehouseId, roleId: id(22) },
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('assignMembership')),
    ).toBe(201);
  });

  it('revokes a Warehouse membership and returns no content (AC-25b)', async () => {
    jest
      .mocked(revokeMembership.execute)
      .mockResolvedValue({ userId: id(4), warehouseId });

    await expect(
      controller.revokeMembership(
        warehouseId,
        id(4),
        request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE),
      ),
    ).resolves.toBeUndefined();
    expect(revokeMembership.execute).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId }),
      { targetUserId: id(4), warehouseId },
    );
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('revokeMembership')),
    ).toBe(204);
  });

  // AC-10/AC-25d — the cross-Workspace failure is non-enumerating and the
  // controller neither catches it nor translates it; only the universal
  // filter turns it into a response (server-error-handling.md §5).
  it.each([
    [
      'renameWarehouse',
      (): Promise<unknown> =>
        controller.renameWarehouse(
          id(9),
          request(WorkspacePermissionId.WAREHOUSES_RENAME),
          { name: 'Other' },
        ),
      renameWarehouse,
    ],
    [
      'setWarehouseArchival',
      (): Promise<unknown> =>
        controller.setWarehouseArchival(
          id(9),
          request(WorkspacePermissionId.WAREHOUSES_ARCHIVE),
          { archived: true },
        ),
      archiveWarehouse,
    ],
    [
      'listAssignableRoles',
      (): Promise<unknown> =>
        controller.listAssignableRoles(
          id(9),
          request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN),
        ),
      listAssignableRoles,
    ],
    [
      'assignMembership',
      (): Promise<unknown> =>
        controller.assignMembership(
          id(9),
          request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_ASSIGN),
          { userId: id(4), roleId: id(22) },
        ),
      assignMembership,
    ],
    [
      'revokeMembership',
      (): Promise<unknown> =>
        controller.revokeMembership(
          id(9),
          id(4),
          request(WorkspacePermissionId.WAREHOUSE_MEMBERSHIPS_REVOKE),
        ),
      revokeMembership,
    ],
  ] as const)(
    '%s propagates the non-enumerating cross-Workspace failure unchanged',
    async (_name, invoke, usecase) => {
      const failure = new ApplicationError(
        ErrorCode.WORKSPACE_TARGET_UNAVAILABLE,
      );
      jest.mocked(usecase.execute).mockRejectedValue(failure);

      await expect(invoke()).rejects.toBe(failure);
    },
  );

  // openapi.yaml documents these as the two 503 failure branches of this
  // surface (POST /warehouses, PUT /warehouses/{warehouseId}/archival): the
  // Manager Role/its assignment could not be established (AC-07) or the
  // archival/restoration could not complete (AC-13). The controller's job at
  // this boundary is unchanged from the 404 case above — let the typed error
  // propagate untouched so the global filter's already-registered mapping for
  // `workspace.warehouse_creation_unavailable` / `workspace.archival_unavailable`
  // (both 503) is what answers the request.
  it.each([
    [
      'createWarehouse',
      (): Promise<unknown> =>
        controller.createWarehouse(
          request(WorkspacePermissionId.WAREHOUSES_CREATE),
          { name: 'Test Warehouse North' },
        ),
      createWarehouse,
      ErrorCode.WORKSPACE_WAREHOUSE_CREATION_UNAVAILABLE,
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
      ErrorCode.WORKSPACE_ARCHIVAL_UNAVAILABLE,
    ],
  ] as const)(
    '%s propagates the documented unavailable-outcome failure unchanged',
    async (_name, invoke, usecase, errorCode) => {
      const failure = new ApplicationError(errorCode);
      jest.mocked(usecase.execute).mockRejectedValue(failure);

      await expect(invoke()).rejects.toBe(failure);
    },
  );

  it('uses the specified mutation success statuses', () => {
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('createWarehouse')),
    ).toBe(201);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('assignMembership')),
    ).toBe(201);
    expect(
      Reflect.getMetadata(HTTP_CODE_METADATA, method('revokeMembership')),
    ).toBe(204);
  });

  // DoD — no controller on this surface contains business logic: it reaches
  // only use cases, never a repository, a domain service or persistence.
  it('reaches use cases only, never a repository, service or persistence', () => {
    const source = readFileSync(
      join(__dirname, 'warehouse.controller.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/from\s+['"]shared\/domain\/repositories\//u);
    expect(source).not.toMatch(/from\s+['"]shared\/domain\/entities\//u);
    expect(source).not.toMatch(/from\s+['"]workspaces\/domain\//u);
    expect(source).not.toMatch(/from\s+['"]typeorm['"]/u);
    expect(source).not.toMatch(/\btry\s*\{/u);
  });
});
