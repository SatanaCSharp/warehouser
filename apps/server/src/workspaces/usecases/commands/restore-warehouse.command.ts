import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'workspaces/domain/errors/workspace.errors';

export interface RestoreWarehouseInput {
  readonly warehouseId: string;
}

export interface RestoreWarehouseResult {
  readonly warehouseId: string;
}

@Injectable()
export class RestoreWarehouseCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: RestoreWarehouseInput,
  ): Promise<RestoreWarehouseResult> {
    // Restoring never re-counts non-archived Warehouses (AC-11a only bounds
    // archiving), so only the specific `warehouses` row is locked.
    const warehouse = await this.warehouseLifecycleRepository.lockWarehouse(
      input.warehouseId,
    );

    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    await this.warehouseLifecycleRepository.setArchivedAt(
      input.warehouseId,
      null,
    );

    return { warehouseId: input.warehouseId };
  }
}
