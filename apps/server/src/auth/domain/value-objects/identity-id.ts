import { assert } from '@warehouser/utils/asserts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

abstract class IdentityId {
  protected constructor(readonly value: string) {
    assert(UUID_PATTERN.test(value), 'Identity ID must be a UUID');
  }
}

export class AccountId extends IdentityId {
  static create(value: string): AccountId {
    return new AccountId(value);
  }
}

export class UserId extends IdentityId {
  static create(value: string): UserId {
    return new UserId(value);
  }
}

export class SessionId extends IdentityId {
  static create(value: string): SessionId {
    return new SessionId(value);
  }
}
