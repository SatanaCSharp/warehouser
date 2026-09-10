import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { PermissionId } from '@warehouser/shared-types/enums';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';

// The protected Warehouse Manager Role is granted the whole Permission catalogue, so this list is
// derived from `PermissionId` rather than restated. A hand-maintained copy silently kept the set a
// release lagged behind: `ordering` added sixteen Permissions and backfilled the Roles that already
// existed (`migrations/1786600100000-GrantOrderingPermissions.ts`), but every Warehouse provisioned
// afterwards was still given the twelve pre-`ordering` ones, so its Manager was refused every items,
// demand and Purchase Draft operation. Deriving keeps the two halves of that pairing in step.
//
// A Permission the Manager must NOT hold goes here, and only here; nothing else about this file
// changes when the catalogue grows.
const MANAGER_EXCLUDED_PERMISSION_IDS: readonly PermissionId[] = [];

const MANAGER_PERMISSION_IDS: readonly PermissionId[] = Object.values(
  PermissionId,
).filter(
  (permissionId) => !MANAGER_EXCLUDED_PERMISSION_IDS.includes(permissionId),
);

export interface ProvisionInitialAccessInput {
  readonly warehouseId: string;
  readonly userId: string;
}

export interface InitialAccessProjection {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

// `workspaces` creates the Warehouse row itself (sad.md §4: "Its former
// Warehouse-row creation moves out"). This command is reduced to the
// Warehouse-provisioning service `workspaces` calls with a `warehouseId` and
// a `userId`; it learns nothing about Workspaces.
@Injectable()
export class ProvisionInitialAccessCommand {
  constructor(
    private readonly accessProvisioningRepository: AccessProvisioningRepository,
  ) {}

  async execute(
    input: ProvisionInitialAccessInput,
  ): Promise<InitialAccessProjection> {
    const roleId = randomUUID();

    await this.accessProvisioningRepository.provisionInitialAccess({
      warehouseId: input.warehouseId,
      userId: input.userId,
      managerRole: {
        id: roleId,
        warehouseId: input.warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
      },
      permissionIds: MANAGER_PERMISSION_IDS,
    });

    return {
      warehouseId: input.warehouseId,
      roleId,
      roleKind: 'warehouse_manager',
      permissionIds: MANAGER_PERMISSION_IDS,
    };
  }
}
