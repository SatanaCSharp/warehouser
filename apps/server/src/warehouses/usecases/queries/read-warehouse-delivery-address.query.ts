import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user.js';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository.js';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors.js';

export interface WarehouseDeliveryAddressRead {
  readonly warehouseId: string;
  readonly addressText: string | null;
  readonly accessNotes: string | null;
}

// AC-10 — what `WAREHOUSES:ADDRESS_UPDATE` is currently recorded against the
// Warehouse record, so the member correcting it in place is shown what they
// are correcting. `null` until an address has been recorded.
//
// This is the Workspace-scoped read that accompanies the write; it is not the
// read a member preparing the dock performs. That one is
// `warehouseDestination` on a Via Warehouse Purchase Draft Line, served under
// `PURCHASE_DRAFTS:WATCH` to a member who may hold no Workspace Role at all
// (sad.md §7).
//
// Ownership is proven against `principal.workspaceId` rather than a
// caller-supplied target, and a Warehouse of another Workspace is reported
// exactly like a missing one.
@Injectable()
export class ReadWarehouseDeliveryAddressQuery {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  async execute(
    currentUser: WorkspaceCurrentUser,
    warehouseId: string,
  ): Promise<WarehouseDeliveryAddressRead> {
    const warehouse =
      await this.warehouseLifecycleRepository.findWarehouse(warehouseId);
    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    return {
      warehouseId,
      addressText: warehouse.deliveryAddressText,
      accessNotes: warehouse.deliveryAccessNotes,
    };
  }
}
