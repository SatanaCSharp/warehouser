import { randomUUID } from 'node:crypto';

import { assert } from '@warehouser/utils/asserts';
import { Permission } from 'access/domain/entities/permission';
import { RoleId, WarehouseId } from 'access/domain/value-objects/access-id';
import { AccessName } from 'access/domain/value-objects/access-name';

export type RoleKind = 'custom' | 'warehouse_manager';

export class Role {
  private constructor(
    readonly id: RoleId,
    readonly warehouseId: WarehouseId,
    readonly name: AccessName,
    readonly kind: RoleKind,
    readonly permissions: readonly Permission[],
  ) {}

  static custom(
    warehouseId: string,
    name: string,
    permissions: readonly Permission[],
    id: string = randomUUID(),
  ): Role {
    assert(
      permissions.every((permission) => permission.isAssignable),
      'Custom roles may contain only assignable Permissions',
    );
    return new Role(
      RoleId.create(id),
      WarehouseId.create(warehouseId),
      AccessName.create(name),
      'custom',
      [...permissions],
    );
  }

  static warehouseManager(
    warehouseId: string,
    permissions: readonly Permission[],
    id: string = randomUUID(),
  ): Role {
    return new Role(
      RoleId.create(id),
      WarehouseId.create(warehouseId),
      AccessName.create('Warehouse Manager'),
      'warehouse_manager',
      [...permissions],
    );
  }

  get isProtected(): boolean {
    return this.kind === 'warehouse_manager';
  }

  rename(name: string): Role {
    this.assertMutable();
    return new Role(
      this.id,
      this.warehouseId,
      AccessName.create(name),
      this.kind,
      this.permissions,
    );
  }

  changePermissions(permissions: readonly Permission[]): Role {
    this.assertMutable();
    assert(
      permissions.every((permission) => permission.isAssignable),
      'Custom roles may contain only assignable Permissions',
    );
    return new Role(this.id, this.warehouseId, this.name, this.kind, [
      ...permissions,
    ]);
  }

  private assertMutable(): void {
    assert(!this.isProtected, 'Warehouse Manager Role is system-managed');
  }
}
