import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from 'shared/database/transaction.module';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

const domainEntities = [
  AccountEntity,
  PermissionEntity,
  RolePermissionEntity,
  RoleEntity,
  SessionEntity,
  UserEntity,
  WarehouseMembershipEntity,
  WarehouseEntity,
];

const domainRepositories = [
  AccessCurrentUserRepository,
  AccessProvisioningRepository,
  AccessReadRepository,
  AuthenticationRepository,
  ManagerTransferRepository,
  MemberLifecycleRepository,
  RoleLifecycleRepository,
];

@Global()
@Module({
  imports: [TransactionModule, TypeOrmModule.forFeature(domainEntities)],
  providers: domainRepositories,
  exports: [TransactionModule, ...domainRepositories],
})
export class DomainModule {}
