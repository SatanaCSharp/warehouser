import {
  GLOBAL_MODULE_METADATA,
  MODULE_METADATA,
} from '@nestjs/common/constants';
import { getRepositoryToken, TypeOrmModule } from '@nestjs/typeorm';
import { DomainModule } from 'shared/domain/domain.module';
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
import { RoleLifecycleRepository } from 'shared/domain/repositories/role-lifecycle.repository';

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
