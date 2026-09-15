import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { MANAGER_PERMISSION_IDS } from 'access/domain/services/manager-permission-catalogue.service';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';

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
