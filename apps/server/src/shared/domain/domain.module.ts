import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionModule } from 'shared/database/transaction.module.js';
import { AccountEntity } from 'shared/domain/entities/account.entity.js';
import { ArrivalAllocationEntity } from 'shared/domain/entities/arrival-allocation.entity.js';
import { CustomerEntity } from 'shared/domain/entities/customer.entity.js';
import { CustomerDeliveryAddressEntity } from 'shared/domain/entities/customer-delivery-address.entity.js';
import { CustomerOrderEntity } from 'shared/domain/entities/customer-order.entity.js';
import { DemandSnapshotEntryEntity } from 'shared/domain/entities/demand-snapshot-entry.entity.js';
import { ItemEntity } from 'shared/domain/entities/item.entity.js';
import { ItemStockAdjustmentEntity } from 'shared/domain/entities/item-stock-adjustment.entity.js';
import { PackagingTypeEntity } from 'shared/domain/entities/packaging-type.entity.js';
import { PermissionEntity } from 'shared/domain/entities/permission.entity.js';
import { PurchaseDraftEntity } from 'shared/domain/entities/purchase-draft.entity.js';
import { PurchaseDraftLineEntity } from 'shared/domain/entities/purchase-draft-line.entity.js';
import { PurchaseDraftLineLinkEntity } from 'shared/domain/entities/purchase-draft-line-link.entity.js';
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity.js';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity.js';
import { RoleEntity } from 'shared/domain/entities/role.entity.js';
import { RolePermissionEntity } from 'shared/domain/entities/role-permission.entity.js';
import { SessionEntity } from 'shared/domain/entities/session.entity.js';
import { UserEntity } from 'shared/domain/entities/user.entity.js';
import { WarehouseEntity } from 'shared/domain/entities/warehouse.entity.js';
import { WarehouseMembershipEntity } from 'shared/domain/entities/warehouse-membership.entity.js';
import { WorkspaceEntity } from 'shared/domain/entities/workspace.entity.js';
import { WorkspaceMembershipEntity } from 'shared/domain/entities/workspace-membership.entity.js';
import { WorkspacePermissionEntity } from 'shared/domain/entities/workspace-permission.entity.js';
import { WorkspaceRoleEntity } from 'shared/domain/entities/workspace-role.entity.js';
import { WorkspaceRolePermissionEntity } from 'shared/domain/entities/workspace-role-permission.entity.js';
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository.js';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository.js';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository.js';
import { ActiveWarehouseSelectionRepository } from 'shared/domain/repositories/active-warehouse-selection.repository.js';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository.js';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository.js';
import { MemberLifecycleRepository } from 'shared/domain/repositories/member-lifecycle.repository.js';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository.js';
import { WarehouseLifecycleRepository } from 'shared/domain/repositories/warehouse-lifecycle.repository.js';
import { WarehouseMembershipAssignmentRepository } from 'shared/domain/repositories/warehouse-membership-assignment.repository.js';
import { WorkspaceCurrentUserRepository } from 'shared/domain/repositories/workspace-current-user.repository.js';
import { WorkspaceLifecycleRepository } from 'shared/domain/repositories/workspace-lifecycle.repository.js';
import { WorkspaceMembershipRepository } from 'shared/domain/repositories/workspace-membership.repository.js';
import { WorkspaceOwnerTransferRepository } from 'shared/domain/repositories/workspace-owner-transfer.repository.js';
import { WorkspaceProvisioningRepository } from 'shared/domain/repositories/workspace-provisioning.repository.js';
import { WorkspaceReadRepository } from 'shared/domain/repositories/workspace-read.repository.js';
import { WorkspaceRoleLifecycleRepository } from 'shared/domain/repositories/workspace-role-lifecycle.repository.js';

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
  PurchaseDraftLineRejectionEntity,
  RejectionReasonEntity,
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
