import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { AccessName } from 'access/domain/value-objects/access-name';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access/access-provisioning.repository';

const MANAGER_PERMISSION_IDS = [
  'ROLES:ASSIGN',
  'ROLES:CREATE',
  'ROLES:DELETE',
  'ROLES:UPDATE',
  'ROLES:WATCH',
  'USERS:CREATE',
  'USERS:UPDATE',
  'USERS:WATCH',
  'WAREHOUSE_MANAGER_ROLE:REASSIGN',
] as const;

export interface AccessProvisioningRuntime {
  readonly warehouseId: () => string;
  readonly roleId: () => string;
}

const accessProvisioningRuntime: AccessProvisioningRuntime = {
  warehouseId: randomUUID,
  roleId: randomUUID,
};

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
    private readonly provisioning: AccessProvisioningRepository,
    private readonly runtime: AccessProvisioningRuntime = accessProvisioningRuntime,
  ) {}

  async execute(
    input: ProvisionInitialAccessInput,
  ): Promise<InitialAccessProjection> {
    const warehouseId = this.runtime.warehouseId();
    const roleId = this.runtime.roleId();
    await this.provisioning.provisionInitialAccess({
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
