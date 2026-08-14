import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import { withUnavailableOutcome } from 'shared/errors/unavailable-outcome';
import {
  workspaceArchivalUnavailableError,
  workspaceLastUnarchivedWarehouseError,
} from 'workspaces/domain/errors/workspace.errors';

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
  execute(
    currentUser: WorkspaceCurrentUser,
    input: ArchiveWarehouseInput,
  ): Promise<ArchiveWarehouseResult> {
    // AC-13 — openapi.yaml documents 503 `workspace.archival_unavailable` for
    // "the change could not complete", which is the whole archival attempt:
    // the AC-11a lock-and-count read and the Warehouse lock can fail for the
    // same infrastructure reasons as the write itself.
    // `withUnavailableOutcome` re-raises the business rejections asserted
    // below untouched, so widening the boundary does not turn a refusal into
    // "try again later" (server-error-handling.md §2).
    return withUnavailableOutcome(
      () => this.archive(currentUser, input),
      workspaceArchivalUnavailableError,
    );
  }

  private async archive(
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
