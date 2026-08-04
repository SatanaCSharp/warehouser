import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessPrincipalRepository } from 'shared/domain/repositories/access/access-principal.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access/access-read.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/access/manager-transfer.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/access/role-lifecycle.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WarehouseEntity,
      PermissionEntity,
      RoleEntity,
      RolePermissionEntity,
      WarehouseMembershipEntity,
    ]),
  ],
  providers: [
    AccessPrincipalRepository,
    AccessProvisioningRepository,
    AccessReadRepository,
    ManagerTransferRepository,
    RoleLifecycleRepository,
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
    AccessPrincipalRepository,
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
