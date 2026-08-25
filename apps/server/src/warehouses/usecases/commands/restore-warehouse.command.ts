import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import { withUnavailableOutcome } from 'shared/errors/unavailable-outcome';
import { workspaceArchivalUnavailableError } from 'warehouses/domain/errors/warehouse.errors';

export interface RestoreWarehouseInput {
  readonly warehouseId: string;
}

export interface RestoreWarehouseResult {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: null;
}

@Injectable()
export class RestoreWarehouseCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  @Transactional()
  execute(
    currentUser: WorkspaceCurrentUser,
    input: RestoreWarehouseInput,
  ): Promise<RestoreWarehouseResult> {
    // AC-13 — the same route and code cover archiving and restoring
    // (sad.md §6.5), and "the change could not complete" is the whole
    // restoration attempt, not only its final write.
    // `withUnavailableOutcome` re-raises the business rejections asserted
    // below untouched (server-error-handling.md §2).
    return withUnavailableOutcome(
      () => this.restore(currentUser, input),
      workspaceArchivalUnavailableError,
    );
  }

  private async restore(
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

    return { id: input.warehouseId, name: warehouse.name, archivedAt: null };
  }
}
