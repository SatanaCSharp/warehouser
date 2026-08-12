import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import {
  workspaceArchivalUnavailableError,
  workspaceTargetUnavailableError,
} from 'workspaces/domain/errors/workspace.errors';

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

    // AC-13 — a failure clearing the archived state is a known
    // infrastructure/technical condition (server-error-handling.md §2), not
    // a business rejection, so it translates into the documented 503,
    // preserving the originating failure as `cause`.
    try {
      await this.warehouseLifecycleRepository.setArchivedAt(
        input.warehouseId,
        null,
      );
    } catch (cause) {
      throw workspaceArchivalUnavailableError(cause);
    }

    return { warehouseId: input.warehouseId };
  }
}
