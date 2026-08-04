import { assert } from '@warehouser/utils/asserts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

abstract class AccessId {
  protected constructor(readonly value: string) {
    assert(UUID_PATTERN.test(value), 'Access identifier must be a UUID');
  }

  equals(other: AccessId): boolean {
    return this.value === other.value;
  }
}

export class WarehouseId extends AccessId {
  static create(value: string): WarehouseId {
    return new WarehouseId(value);
  }
}

export class RoleId extends AccessId {
  static create(value: string): RoleId {
    return new RoleId(value);
  }
}

export class MemberId extends AccessId {
  static create(value: string): MemberId {
    return new MemberId(value);
  }
}
