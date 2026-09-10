import 'reflect-metadata';

import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import {
  ErrorCode,
  WorkspacePermissionId,
} from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import { WarehouseAccessController } from 'access/rest/controllers/warehouse-access.controller';
import type { AssignWarehouseMembershipCommand } from 'access/usecases/commands/assign-warehouse-membership.command';
import type { RevokeWarehouseMembershipCommand } from 'access/usecases/commands/revoke-warehouse-membership.command';
import type { ListAssignableWarehouseRolesQuery } from 'access/usecases/queries/list-assignable-warehouse-roles.query';
import type { WorkspaceAccessRequest } from 'shared/access/access-request';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const method = (name: keyof WarehouseAccessController): object =>
  Object.getOwnPropertyDescriptor(WarehouseAccessController.prototype, name)
    ?.value as object;

// The membership-edge half of `warehouse.controller.spec.ts`, moved with its
// handlers when granting and revoking a Warehouse Role landed in `access`
// (CH-S3). Every assertion below is the one it made there; only the file, the
// controller class and the import specifiers changed (CR-RG-01). The route
// metadata these handlers declare — method, full path, guard set, permission
// decorator and DTO class — is asserted against the pinned baseline by
// `tests/refactor/route-table.spec.mjs` (CR-AC-11).
describe('WarehouseAccessController', () => {
  const listAssignableRoles = {
    execute: vi.fn(),
  } as unknown as ListAssignableWarehouseRolesQuery;
  const assignMembership = {
    execute: vi.fn(),
  } as unknown as AssignWarehouseMembershipCommand;
  const revokeMembership = {
    execute: vi.fn(),
  } as unknown as RevokeWarehouseMembershipCommand;

  const controller = new WarehouseAccessController(
    listAssignableRoles,
    assignMembership,
    revokeMembership,
  );

  beforeEach(() => vi.clearAllMocks());

  it('returns only identifiers and names of assignable Roles (AC-23a)', async () => {
    vi.mocked(listAssignableRoles.execute).mockResolvedValue([
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
    vi.mocked(assignMembership.execute).mockResolvedValue({
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
    vi.mocked(revokeMembership.execute).mockResolvedValue({
      userId: id(4),
      warehouseId,
    });

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
      vi.mocked(usecase.execute).mockRejectedValue(failure);

      await expect(invoke()).rejects.toBe(failure);
    },
  );
});
