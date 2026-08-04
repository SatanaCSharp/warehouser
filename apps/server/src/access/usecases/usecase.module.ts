import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateRoleCommand } from 'access/usecases/commands/create-role.command';
import { ProvisionInitialAccessCommand } from 'access/usecases/commands/provision-initial-access.command';
import { UpdateRoleCommand } from 'access/usecases/commands/update-role.command';
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
  ],
  exports: [
    ProvisionInitialAccessCommand,
    CreateRoleCommand,
    UpdateRoleCommand,
  ],
})
export class AccessUsecaseModule {}
