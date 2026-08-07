import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AccessName } from 'access/domain/value-objects/access-name';
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
  readonly userId: string;
  readonly warehouseName: string;
}

export interface InitialAccessProjection {
  readonly warehouseId: string;
  readonly roleId: string;
  readonly roleKind: 'warehouse_manager';
  readonly permissionIds: readonly string[];
}

@Injectable()
export class ProvisionInitialAccessCommand {
  constructor(
    private readonly accessProvisioningRepository: AccessProvisioningRepository,
  ) {}

  async execute(
    input: ProvisionInitialAccessInput,
  ): Promise<InitialAccessProjection> {
    const warehouseId = randomUUID();
    const roleId = randomUUID();

    await this.accessProvisioningRepository.provisionInitialAccess({
      warehouse: {
        id: warehouseId,
        name: AccessName.create(input.warehouseName).value,
      },
      managerRole: {
        id: roleId,
        warehouseId,
        name: 'Warehouse Manager',
        kind: 'warehouse_manager',
      },
      managerMembership: {
        userId: input.userId,
        warehouseId,
        roleId,
        roleKind: 'warehouse_manager',
      },
      permissionIds: MANAGER_PERMISSION_IDS,
    });

    return {
      warehouseId,
      roleId,
      roleKind: 'warehouse_manager',
      permissionIds: MANAGER_PERMISSION_IDS,
    };
  }
}
