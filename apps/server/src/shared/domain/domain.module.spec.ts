import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from 'shared/domain/domain.module.js';
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
import { AccessCurrentUserRepository } from 'shared/domain/repositories/access-current-user.repository.js';
import { AccessProvisioningRepository } from 'shared/domain/repositories/access-provisioning.repository.js';
import { AccessReadRepository } from 'shared/domain/repositories/access-read.repository.js';
import { AuthenticationRepository } from 'shared/domain/repositories/authentication.repository.js';
import { ManagerTransferRepository } from 'shared/domain/repositories/manager-transfer.repository.js';
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository.js';
import { describe, expect, it } from 'vitest';

describe('DomainModule', () => {
  it('registers every shared entity with TypeORM', () => {
    const entities = [
      AccountEntity,
      PermissionEntity,
      RolePermissionEntity,
      RoleEntity,
      SessionEntity,
      UserEntity,
      WarehouseMembershipEntity,
      WarehouseEntity,
    ];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DomainModule,
    ) as Array<{ module?: unknown; providers?: unknown[] }>;
    const typeOrmFeatureModule = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeatureModule?.providers).toEqual(
      expect.arrayContaining(
        entities.map(
          (entity): unknown =>
            expect.objectContaining({
              provide: String(getRepositoryToken(entity)),
            }) as unknown,
        ),
      ),
    );
  });

  it('registers every ordering shared entity with TypeORM (T3 AC-03, AC-11)', () => {
    const orderingEntities = [
      ItemEntity,
      ItemStockAdjustmentEntity,
      CustomerOrderEntity,
      PackagingTypeEntity,
      PurchaseDraftEntity,
      PurchaseDraftLineEntity,
      PurchaseDraftLineLinkEntity,
      DemandSnapshotEntryEntity,
      ArrivalAllocationEntity,
    ];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DomainModule,
    ) as Array<{ module?: unknown; providers?: unknown[] }>;
    const typeOrmFeatureModule = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeatureModule?.providers).toEqual(
      expect.arrayContaining(
        orderingEntities.map(
          (entity): unknown =>
            expect.objectContaining({
              provide: String(getRepositoryToken(entity)),
            }) as unknown,
        ),
      ),
    );
  });

  it('registers every delivery-addresses shared entity with TypeORM (T4 AC-01, AC-04)', () => {
    const deliveryAddressEntities = [
      CustomerEntity,
      CustomerDeliveryAddressEntity,
    ];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DomainModule,
    ) as Array<{ module?: unknown; providers?: unknown[] }>;
    const typeOrmFeatureModule = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeatureModule?.providers).toEqual(
      expect.arrayContaining(
        deliveryAddressEntities.map(
          (entity): unknown =>
            expect.objectContaining({
              provide: String(getRepositoryToken(entity)),
            }) as unknown,
        ),
      ),
    );
  });

  it('registers every arrival-inspection shared entity with TypeORM (T3 AC-05, AC-15, AC-24)', () => {
    const arrivalInspectionEntities = [
      RejectionReasonEntity,
      PurchaseDraftLineRejectionEntity,
      PurchaseDraftLineEntity,
    ];
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      DomainModule,
    ) as Array<{ module?: unknown; providers?: unknown[] }>;
    const typeOrmFeatureModule = imports.find(
      (importedModule) => importedModule.module === TypeOrmModule,
    );

    expect(typeOrmFeatureModule?.providers).toEqual(
      expect.arrayContaining(
        arrivalInspectionEntities.map(
          (entity): unknown =>
            expect.objectContaining({
              provide: String(getRepositoryToken(entity)),
            }) as unknown,
        ),
      ),
    );
  });

  it('globally provides and exports every shared repository', () => {
    const repositories = [
      AuthenticationRepository,
      AccessCurrentUserRepository,
      AccessProvisioningRepository,
      AccessReadRepository,
      ManagerTransferRepository,
      RoleLifecycleRepository,
    ];

    expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, DomainModule)).toBe(
      true,
    );
    expect(
      Reflect.getMetadata(MODULE_METADATA.PROVIDERS, DomainModule),
    ).toEqual(expect.arrayContaining(repositories));
    expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, DomainModule)).toEqual(
      expect.arrayContaining(repositories),
    );
  });
});
