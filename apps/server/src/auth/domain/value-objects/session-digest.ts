import { assert } from '@warehouser/utils/asserts';

const SESSION_DIGEST_LENGTH = 32;

export class SessionDigest {
  private constructor(readonly value: Uint8Array) {}

  static create(value: Uint8Array): SessionDigest {
    assert(
      value.byteLength === SESSION_DIGEST_LENGTH,
      'Session digest must contain exactly 32 bytes',
    );
    return new SessionDigest(Uint8Array.from(value));
  }
}
