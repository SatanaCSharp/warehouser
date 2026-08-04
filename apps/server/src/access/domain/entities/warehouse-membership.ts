import { Role } from 'access/domain/entities/role';
import { MemberId, WarehouseId } from 'access/domain/value-objects/access-id';

export class WarehouseMembership {
  private constructor(
    readonly memberId: MemberId,
    readonly warehouseId: WarehouseId,
    readonly role: Role,
  ) {}

  static create(
    memberId: string,
    warehouseId: string,
    role: Role,
  ): WarehouseMembership {
    return new WarehouseMembership(
      MemberId.create(memberId),
      WarehouseId.create(warehouseId),
      role,
    );
  }

  get isManager(): boolean {
    return this.role.isProtected;
  }
}
