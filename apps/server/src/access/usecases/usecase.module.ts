import { Module } from '@nestjs/common';
import { RoleDeletionService } from 'access/domain/services/role-deletion.service';
import { AssignMemberRoleCommand } from 'access/usecases/commands/assign-member-role.command';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { DeleteRoleCommand } from 'access/usecases/commands/delete-role.command';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { TransferWarehouseManagerCommand } from 'access/usecases/commands/transfer-warehouse-manager.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
import { ListAccessMembersQuery } from 'access/usecases/queries/list-access-members.query';
import { ListAccessPermissionsQuery } from 'access/usecases/queries/list-access-permissions.query';
import { ListAccessRolesQuery } from 'access/usecases/queries/list-access-roles.query';
import { ReadCurrentAccessQuery } from 'access/usecases/queries/read-current-access.query';

@Module({
  providers: [
    RoleDeletionService,
    ProvisionInitialAccessCommand,
    CreateRoleCommand,
    UpdateRoleCommand,
    AssignMemberRoleCommand,
    DeleteRoleCommand,
    TransferWarehouseManagerCommand,
    ReadCurrentAccessQuery,
    ListAccessRolesQuery,
    ListAccessPermissionsQuery,
    ListAccessMembersQuery,
  ],
  exports: [
    ProvisionInitialAccessCommand,
    CreateRoleCommand,
    UpdateRoleCommand,
    AssignMemberRoleCommand,
    DeleteRoleCommand,
    TransferWarehouseManagerCommand,
    ReadCurrentAccessQuery,
    ListAccessRolesQuery,
    ListAccessPermissionsQuery,
    ListAccessMembersQuery,
  ],
})
export class AccessUsecaseModule {}
