const SESSION_DIGEST_LENGTH = 32;

export class SessionDigest {
  private constructor(readonly value: Uint8Array) {}

  static create(value: Uint8Array): SessionDigest {
    if (value.byteLength !== SESSION_DIGEST_LENGTH) {
      throw new Error('Session digest must contain exactly 32 bytes');
    }

    return new SessionDigest(Uint8Array.from(value));
  }
}
