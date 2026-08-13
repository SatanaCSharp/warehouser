import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';

const MANAGER_PERMISSION_IDS = [
  'ROLES:ASSIGN',
  'ROLES:CREATE',
  'ROLES:DELETE',
  'ROLES:UPDATE',
  'ROLES:WATCH',
  'USERS:CREATE',
  'USERS:DELETE',
  'USERS:EMAIL_UPDATE',
  'USERS:PASSWORD_CHANGE',
  'USERS:UPDATE',
  'USERS:WATCH',
  'WAREHOUSE_MANAGER_ROLE:REASSIGN',
] as const;

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
