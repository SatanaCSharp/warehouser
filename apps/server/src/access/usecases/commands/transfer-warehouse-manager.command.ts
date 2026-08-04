import { Injectable } from '@nestjs/common';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import { ManagerTransferRepository } from 'shared/domain/repositories/access/manager-transfer.repository';

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
      principal.permissionId === PermissionId.WAREHOUSE_MANAGER_ROLE_REASSIGN &&
      principal.userId !== input.recipientId;
    if (!authorized) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }

    const transferred = await this.transactions.executeInTransaction({}, () =>
      this.transfers.transfer({
        warehouseId: principal.warehouseId,
        currentManagerUserId: principal.userId,
        recipientUserId: input.recipientId,
        formerManagerRoleId: input.replacementRoleId,
      }),
    );
    if (!transferred) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }
    return { managerId: input.recipientId };
  }
}
