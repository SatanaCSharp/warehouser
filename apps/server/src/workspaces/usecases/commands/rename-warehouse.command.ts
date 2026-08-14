import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import { validateWarehouseName } from 'workspaces/usecases/commands/create-warehouse.command';

export interface RenameWarehouseInput {
  readonly warehouseId: string;
  readonly name: string;
}

export interface WarehouseWriteProjection {
  readonly id: string;
  readonly name: string;
  readonly archivedAt: Date | null;
}

// `WAREHOUSES:RENAME`-guarded. Its subject is the Warehouse record, so it
// resolves authority through the Workspace guard and never consults archived
// state (sad.md §7). Name rules are validated before the target Warehouse is
// ever touched, and a Warehouse of another Workspace is denied exactly like
// a missing one (AC-10) — `lockWarehouse` returning `null` and a
// `workspaceId` mismatch both fail the same assertion, so neither
// discloses existence.
@Injectable()
export class RenameWarehouseCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: RenameWarehouseInput,
  ): Promise<WarehouseWriteProjection> {
    const name = validateWarehouseName(input.name);

    const warehouse = await this.warehouseLifecycleRepository.lockWarehouse(
      input.warehouseId,
    );
    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    await this.warehouseLifecycleRepository.renameWarehouse(
      input.warehouseId,
      name,
    );

    return {
      id: input.warehouseId,
      name,
      archivedAt: warehouse.archivedAt,
    };
  }
}
