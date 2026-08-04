import { Injectable } from '@nestjs/common';
import { getEntityManager } from 'shared/database/db-transaction-context.service';
import { DataSource } from 'typeorm';

export interface ManagerTransferPersistenceInput {
  readonly warehouseId: string;
  readonly currentManagerUserId: string;
  readonly recipientUserId: string;
  readonly formerManagerRoleId: string;
}

export type ManagerTransferResult =
  | 'transferred'
  | 'target-unavailable'
  | 'invalid-transfer'
  | 'concurrent-change';

interface TransferMembershipRow {
  readonly userId: string;
  readonly roleId: string;
  readonly roleKind: 'custom' | 'warehouse_manager';
}

@Injectable()
export class ManagerTransferRepository {
  constructor(private readonly dataSource: DataSource) {}

  async transfer(
    input: ManagerTransferPersistenceInput,
  ): Promise<ManagerTransferResult> {
    const manager = getEntityManager(this.dataSource);
    const warehouses = await manager.query<{ readonly id: string }[]>(
      'SELECT id FROM warehouses WHERE id = $1 FOR UPDATE',
      [input.warehouseId],
    );
    if (warehouses.length !== 1) {
      return 'target-unavailable';
    }

    const replacementRoles = await manager.query<{ readonly id: string }[]>(
      `SELECT id FROM roles
        WHERE id = $2 AND warehouse_id = $1 AND kind = 'custom'
        FOR UPDATE`,
      [input.warehouseId, input.formerManagerRoleId],
    );
    const memberships = await manager.query<TransferMembershipRow[]>(
      `SELECT user_id AS "userId", role_id AS "roleId", role_kind AS "roleKind"
         FROM warehouse_memberships
        WHERE warehouse_id = $1 AND user_id = ANY($2::uuid[])
        ORDER BY user_id FOR UPDATE`,
      [input.warehouseId, [input.currentManagerUserId, input.recipientUserId]],
    );
    const current = memberships.find(
      (membership) => membership.userId === input.currentManagerUserId,
    );
    const recipient = memberships.find(
      (membership) => membership.userId === input.recipientUserId,
    );
    if (replacementRoles.length !== 1) {
      return 'invalid-transfer';
    }
    if (!recipient) {
      return 'target-unavailable';
    }
    if (
      current?.roleKind !== 'warehouse_manager' ||
      recipient.roleKind !== 'custom'
    ) {
      return 'concurrent-change';
    }

    const [, demoted] = await manager.query<[unknown[], number]>(
      `UPDATE warehouse_memberships
          SET role_id = $3,
              role_kind = 'custom',
              updated_at = CURRENT_TIMESTAMP
        WHERE warehouse_id = $1 AND user_id = $2`,
      [
        input.warehouseId,
        input.currentManagerUserId,
        input.formerManagerRoleId,
      ],
    );
    const [, promoted] = await manager.query<[unknown[], number]>(
      `UPDATE warehouse_memberships
          SET role_id = $3,
              role_kind = 'warehouse_manager',
              updated_at = CURRENT_TIMESTAMP
        WHERE warehouse_id = $1 AND user_id = $2`,
      [input.warehouseId, input.recipientUserId, current.roleId],
    );
    return demoted === 1 && promoted === 1
      ? 'transferred'
      : 'concurrent-change';
  }
}
