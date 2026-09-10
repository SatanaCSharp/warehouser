import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository.js';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors.js';
import { workspaceLastUnarchivedWarehouseError } from 'warehouses/domain/errors/warehouse.errors.js';

export interface ArchiveWarehouseInput {
  readonly warehouseId: string;
}

export interface ArchiveWarehouseResult {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date;
}

@Injectable()
export class ArchiveWarehouseCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: ArchiveWarehouseInput,
  ): Promise<ArchiveWarehouseResult> {
    // Lock order (data-model.md "Lock order"): the parent `workspaces` row
    // first, so the AC-11a re-count cannot see a phantom concurrent create
    // or archive, then the specific `warehouses` row.
    const nonArchivedCount =
      await this.warehouseLifecycleRepository.lockWorkspaceAndCountNonArchivedWarehouses(
        currentUser.workspaceId,
      );

    const warehouse = await this.warehouseLifecycleRepository.lockWarehouse(
      input.warehouseId,
    );

    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    const isLastNonArchivedWarehouse =
      warehouse.archivedAt === null && nonArchivedCount <= 1;
    assert(
      !isLastNonArchivedWarehouse,
      workspaceLastUnarchivedWarehouseError(),
    );

    const archivedAt = new Date();
    await this.warehouseLifecycleRepository.setArchivedAt(
      input.warehouseId,
      archivedAt,
    );

    return { id: input.warehouseId, name: warehouse.name, archivedAt };
  }
}
