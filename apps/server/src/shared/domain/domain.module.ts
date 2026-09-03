import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from 'shared/database/transaction.module';
import { AccountEntity } from 'shared/domain/entities/account.entity';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity';
import { CustomerEntity } from 'shared/domain/entities/customer.entity';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity';
import { ItemEntity } from 'shared/domain/entities/item.entity';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity';
import { PermissionEntity } from 'shared/domain/entities/permission.entity';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity';
import { RoleEntity } from 'shared/domain/entities/role.entity';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity';
import { SessionEntity } from 'shared/domain/entities/session.entity';
import { UserEntity } from 'shared/domain/entities/user.entity';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository';
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository';
import { CustomerAddressBookRepository } from 'shared/domain/repositories/customer-address-book.repository';
import { CustomerAwaitingDemandRepository } from 'shared/domain/repositories/customer-awaiting-demand.repository';
import { CustomerDirectoryRepository } from 'shared/domain/repositories/customer-directory.repository';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository';

const domainEntities = [
  AccountEntity,
  ArrivalAllocationEntity,
  CustomerEntity,
  CustomerDeliveryAddressEntity,
  CustomerOrderEntity,
  DemandSnapshotEntryEntity,
  ItemEntity,
  ItemStockAdjustmentEntity,
  PackagingTypeEntity,
  PermissionEntity,
  PurchaseDraftEntity,
  PurchaseDraftLineEntity,
  PurchaseDraftLineLinkEntity,
  RolePermissionEntity,
  RoleEntity,
  SessionEntity,
  UserEntity,
  WarehouseMembershipEntity,
  WarehouseEntity,
  WorkspaceEntity,
  WorkspacePermissionEntity,
  WorkspaceRoleEntity,
  WorkspaceRolePermissionEntity,
  WorkspaceMembershipEntity,
];

const domainRepositories = [
  AccessCurrentUserRepository,
  AccessProvisioningRepository,
  AccessReadRepository,
  AuthenticationRepository,
  CustomerAddressBookRepository,
  CustomerAwaitingDemandRepository,
  CustomerDirectoryRepository,
  ManagerTransferRepository,
  MemberLifecycleRepository,
  RoleLifecycleRepository,
  ActiveWarehouseSelectionRepository,
  WarehouseLifecycleRepository,
  WarehouseMembershipAssignmentRepository,
  WorkspaceCurrentUserRepository,
  WorkspaceLifecycleRepository,
  WorkspaceMembershipRepository,
  WorkspaceOwnerTransferRepository,
  WorkspaceProvisioningRepository,
  WorkspaceReadRepository,
  WorkspaceRoleLifecycleRepository,
];

@Global()
@Module({
  imports: [TransactionModule, TypeOrmModule.forFeature(domainEntities)],
  providers: domainRepositories,
  exports: [TransactionModule, ...domainRepositories],
})
export class DomainModule {}
