import { Injectable } from '@nestjs/common';
import { ErrorCode, PermissionId } from '@warehouser/shared-types/enums';
import { ApplicationError } from '@warehouser/shared-types/errors';
import type { AccessPrincipal } from 'shared/access/access-principal';
import { DbTransactionService } from 'shared/database/db-transaction.service';
import {
  type RoleDeletionResult,
  RoleLifecycleRepository,
} from 'shared/domain/repositories/access/role-lifecycle.repository';

export interface DeleteRoleInput {
  readonly roleId: string;
  readonly replacementRoleId?: string;
}

@Injectable()
export class DeleteRoleCommand {
  constructor(
    private readonly roles: RoleLifecycleRepository,
    private readonly transactions: DbTransactionService,
  ) {}

  async execute(
    principal: AccessPrincipal,
    input: DeleteRoleInput,
  ): Promise<{ readonly id: string }> {
    if (principal.permissionId !== PermissionId.ROLES_DELETE) {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED);
    }
    const result = await this.transactions.executeInTransaction({}, () =>
      this.roles.deleteCustomRole(
        principal.warehouseId,
        input.roleId,
        input.replacementRoleId,
      ),
    );
    this.assertDeleted(result);
    return { id: input.roleId };
  }

  private assertDeleted(result: RoleDeletionResult): void {
    if (result !== 'deleted') {
      throw new ApplicationError(ErrorCode.ACCESS_DENIED, { reason: result });
    }
  }
}
