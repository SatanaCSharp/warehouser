import { Injectable } from '@nestjs/common';
import { assert, assertDefined } from '@warehouser/utils/asserts';
import {
  accessDeniedError,
  concurrentAccessChangeError,
  invalidManagerTransferError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors';
import type { AccessCurrentUser } from 'shared/access/access-current-user';
import { Transactional } from 'shared/decorators/transactional.decorator';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';

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

    assertDefined(recipient, targetUnavailableError());

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
