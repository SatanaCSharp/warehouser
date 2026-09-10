import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  accessDeniedError,
  concurrentAccessChangeError,
  invalidManagerTransferError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors.js';
import type { AccessCurrentUser } from 'shared/access/access-current-user.js';
import { Transactional } from 'shared/decorators/transactional.decorator.js';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository.js';

export interface TransferWarehouseManagerInput {
  readonly recipientId: string;
  readonly replacementRoleId: string;
}

@Injectable()
export class TransferWarehouseManagerCommand {
  constructor(
    private readonly managerTransferRepository: ManagerTransferRepository,
  ) {}

  @Transactional()
  async execute(
    currentUser: AccessCurrentUser,
    input: TransferWarehouseManagerInput,
  ): Promise<{ readonly managerId: string }> {
    assert(currentUser.roleKind === 'warehouse_manager', accessDeniedError());
    assert(
      currentUser.userId !== input.recipientId,
      invalidManagerTransferError(),
    );

    const warehouse = await this.managerTransferRepository.lockWarehouse(
      currentUser.warehouseId,
    );

    assertDefined(warehouse, targetUnavailableError());

    const replacement =
      await this.managerTransferRepository.lockReplacementRole(
        currentUser.warehouseId,
        input.replacementRoleId,
      );

    assertDefined(replacement, invalidManagerTransferError());

    const members = await this.managerTransferRepository.lockMembers(
      currentUser.warehouseId,
      [currentUser.userId, input.recipientId],
    );

    const current = members.find(
      (member) => member.userId === currentUser.userId,
    );

    const recipient = members.find(
      (member) => member.userId === input.recipientId,
    );

    // The recipient holds no membership in the named Warehouse. `openapi.yaml`'s manager-transfer
    // path documents this as 400 `access.invalid_manager_transfer`, alongside self-transfer and a
    // missing replacement Role selection (AC-36a) — not the generic 404
    // `access.target_unavailable` used for a genuinely missing Warehouse above.
    assertDefined(recipient, invalidManagerTransferError());

    assert(
      current?.roleKind === 'warehouse_manager' &&
        recipient.roleKind === 'custom',
      concurrentAccessChangeError(),
    );

    const demoted = await this.managerTransferRepository.assignRole(
      currentUser.warehouseId,
      currentUser.userId,
      replacement.id,
      'custom',
    );

    assert(demoted, concurrentAccessChangeError());

    const promoted = await this.managerTransferRepository.assignRole(
      currentUser.warehouseId,
      recipient.userId,
      current.roleId,
      'warehouse_manager',
    );

    assert(promoted, concurrentAccessChangeError());

    return { managerId: input.recipientId };
  }
}
