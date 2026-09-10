import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import { isEmpty } from '@warehouser/utils/predicates';
import type { WorkspaceCurrentUser } from 'shared/access/workspace-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { workspaceTargetUnavailableError } from 'shared/errors/cross-module.errors';
import { warehouseDeliveryAddressBlankError } from 'warehouses/domain/errors/warehouse.errors';

export interface SetWarehouseDeliveryAddressInput {
  readonly warehouseId: string;
  readonly addressText: string;
  readonly accessNotes?: string | null;
}

export interface WarehouseDeliveryAddressProjection {
  readonly warehouseId: string;
  readonly addressText: string;
  readonly accessNotes: string | null;
}

/** Access notes are never stored as an empty string: what a driver needs to
 * get in was either written down or it was not (openapi.yaml `AccessNotes`). */
const recordableNotes = (accessNotes?: string | null): string | null => {
  const trimmed = accessNotes?.trim() ?? '';
  return isEmpty(trimmed) ? null : trimmed;
};

// `WAREHOUSES:ADDRESS_UPDATE`-guarded, and the one flow of this feature that
// does not resolve through the Warehouse-scoped authorization spine: the
// subject is the Warehouse **record**, which `workspaces` already classifies
// as a Workspace Capability beside renaming and archiving (sad.md §4).
// It therefore resolves authority through the Workspace guard and never
// consults archived state, and a Warehouse of another Workspace is denied
// exactly like a missing one — `lockWarehouse` returning `null` and a
// `workspaceId` mismatch fail the same way, so neither discloses existence.
//
// One address, corrected in place: the write is a single-row update and there
// is no deactivation or clearing counterpart (AC-10).
@Injectable()
export class SetWarehouseDeliveryAddressCommand {
  constructor(
    private readonly warehouseLifecycleRepository: WarehouseLifecycleRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: WorkspaceCurrentUser,
    input: SetWarehouseDeliveryAddressInput,
  ): Promise<WarehouseDeliveryAddressProjection> {
    const addressText = input.addressText.trim();
    assert(!isEmpty(addressText), warehouseDeliveryAddressBlankError());
    const accessNotes = recordableNotes(input.accessNotes);

    const warehouse = await this.warehouseLifecycleRepository.lockWarehouse(
      input.warehouseId,
    );
    assertDefined(warehouse, workspaceTargetUnavailableError());
    assert(
      warehouse.workspaceId === currentUser.workspaceId,
      workspaceTargetUnavailableError(),
    );

    await this.warehouseLifecycleRepository.setDeliveryAddress(
      input.warehouseId,
      { addressText, accessNotes },
    );

    return { warehouseId: input.warehouseId, addressText, accessNotes };
  }
}
