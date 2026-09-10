/**
 * Every persistence entity, listed by hand.
 *
 * TypeORM also accepts a glob of `*.entity.ts` and loads the matches itself at
 * runtime — which is what `data-source.ts` does under `ts-node`. The test
 * tiers cannot: Vitest externalizes `typeorm` to Node, so TypeORM's own
 * `require()` of a `.ts` entity bypasses the SWC transform and Node's type
 * stripping rejects the first `@Column()` it meets ("SyntaxError: Invalid or
 * unexpected token"). Handing TypeORM the classes instead means the entities
 * arrive through the module graph, already compiled.
 *
 * A hand-written list rots. `entity-registry.architectural.spec.ts` fails the
 * build when a `*.entity.ts` file is missing from it, so it cannot rot
 * silently.
 */

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
import { PurchaseDraftLineRejectionEntity } from 'shared/domain/entities/purchase-draft-line-rejection.entity';
import { RejectionReasonEntity } from 'shared/domain/entities/rejection-reason.entity';
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

/** Passed to every `DataSource` that must not resolve entities by glob. */
export const entities = [
  AccountEntity,
  ArrivalAllocationEntity,
  CustomerDeliveryAddressEntity,
  CustomerOrderEntity,
  CustomerEntity,
  DemandSnapshotEntryEntity,
  ItemStockAdjustmentEntity,
  ItemEntity,
  PackagingTypeEntity,
  PermissionEntity,
  PurchaseDraftLineLinkEntity,
  PurchaseDraftLineRejectionEntity,
  PurchaseDraftLineEntity,
  PurchaseDraftEntity,
  RejectionReasonEntity,
  RolePermissionEntity,
  RoleEntity,
  SessionEntity,
  UserEntity,
  WarehouseMembershipEntity,
  WarehouseEntity,
  WorkspaceMembershipEntity,
  WorkspacePermissionEntity,
  WorkspaceRolePermissionEntity,
  WorkspaceRoleEntity,
  WorkspaceEntity,
];
