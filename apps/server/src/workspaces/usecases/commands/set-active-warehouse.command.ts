import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository.js';
import {
  workspaceTargetUnavailableError,
  workspaceWarehouseArchivedError,
} from 'shared/errors/cross-module.errors.js';

export interface SetActiveWarehouseInput {
  readonly warehouseId: string;
}

export interface SetActiveWarehouseResult {
  readonly effectiveWarehouseId: string;
}

// This route is session-authenticated and declares no Workspace or
// Warehouse Permission (sad.md §6.8): selecting is not a capability over a
// Warehouse resource, so the command's input is the session's bare
// `userId`, not a `WorkspaceCurrentUser`/`WarehouseCurrentUser` — the
// command itself proves a live, non-archived membership in the target
// Warehouse. The selection it stores is presentation state: no guard or
// use case ever reads it back for an authorization decision (spec.md §6.1
// "Stale selection").
@Injectable()
export class SetActiveWarehouseCommand {
  constructor(
    private readonly activeWarehouseSelectionRepository: ActiveWarehouseSelectionRepository,
  ) {}

  @Transactional()
  async execute(
    userId: string,
    input: SetActiveWarehouseInput,
  ): Promise<SetActiveWarehouseResult> {
    const lock =
      await this.activeWarehouseSelectionRepository.lockMembershipForSelection(
        userId,
        input.warehouseId,
      );

    // AC-04 — no membership in that Warehouse at all: deny and leave the
    // stored selection unchanged.
    assertDefined(lock, workspaceTargetUnavailableError());
    // AC-04/AC-11 — an archived Warehouse stops being selectable: deny and
    // leave the stored selection unchanged.
    assert(lock.archivedAt === null, workspaceWarehouseArchivedError());

    await this.activeWarehouseSelectionRepository.setActiveWarehouse(
      userId,
      input.warehouseId,
    );

    return { effectiveWarehouseId: input.warehouseId };
  }
}
