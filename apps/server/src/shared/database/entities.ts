/**
 * Every persistence entity, listed by hand.
 *
 * TypeORM also accepts a glob of `*.entity.ts` and loads the matches itself at
 * runtime. Nothing in this repository can: Vitest externalizes `typeorm` to
 * Node, and the ESM `data-source.ts` the CLI drives has TypeORM `import()` the
 * matches, so either way TypeORM's own load of a `.ts` entity bypasses the
 * transform and Node's type stripping rejects the first `@Column()` it meets
 * ("SyntaxError: Invalid or unexpected token"). Handing TypeORM the classes
 * instead means the entities arrive through the module graph, already
 * compiled.
 *
 * A hand-written list rots. `entity-registry.architectural.spec.ts` fails the
 * build when a `*.entity.ts` file is missing from it, so it cannot rot
 * silently.
 */

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
