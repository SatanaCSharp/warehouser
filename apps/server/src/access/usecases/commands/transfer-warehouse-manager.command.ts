import { Injectable } from '@nestjs/common';
import { PermissionId } from '@warehouser/shared-types/enums';
import {
  accessDeniedError,
  concurrentAccessChangeError,
  invalidManagerTransferError,
  managerTransferUnavailableError,
  targetUnavailableError,
} from 'access/domain/errors/access.errors';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { ManagerTransferRepository } from 'shared/domain/repositories/access/manager-transfer.repository';

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  Object.getOwnPropertyDescriptor(error, 'code')?.value === '23505';

export interface TransferWarehouseManagerInput {
  readonly recipientId: string;
  readonly replacementRoleId: string;
}

@Injectable()
export class TransferWarehouseManagerCommand {
  constructor(
    private readonly transfers: ManagerTransferRepository,
    private readonly transactions: DbTransactionService,
  ) {}

  async execute(
    principal: AccessPrincipal,
    input: TransferWarehouseManagerInput,
  ): Promise<{ readonly managerId: string }> {
    const authorized =
      principal.roleKind === 'warehouse_manager' &&
      principal.permissionId === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN;
    if (!authorized) {
      throw accessDeniedError();
    }
    if (principal.userId === input.recipientId) {
      throw invalidManagerTransferError();
    }

    let result;
    try {
      result = await this.transactions.executeInTransaction({}, () =>
        this.transfers.transfer({
          warehouseId: principal.warehouseId,
          currentManagerUserId: principal.userId,
          recipientUserId: input.recipientId,
          formerManagerRoleId: input.replacementRoleId,
        }),
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw concurrentAccessChangeError();
      }
      throw managerTransferUnavailableError(error);
    }
    if (result === 'target-unavailable') {
      throw targetUnavailableError();
    }
    if (result === 'invalid-transfer') {
      throw invalidManagerTransferError();
    }
    if (result !== 'transferred') {
      throw concurrentAccessChangeError();
    }
    return { managerId: input.recipientId };
  }
}
