import { AccountId, SessionId } from 'auth/domain/value-objects/identity-id';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

export interface EstablishSession {
  readonly id: SessionId;
  readonly accountId: AccountId;
  readonly digest: SessionDigest;
  readonly establishedAt: Date;
}

export interface RestoreSession extends EstablishSession {
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export class Session {
  private constructor(
    readonly id: SessionId,
    readonly accountId: AccountId,
    readonly digest: SessionDigest,
    readonly establishedAt: Date,
    readonly expiresAt: Date,
    readonly revokedAt: Date | null,
  ) {}

  static establish(input: EstablishSession): Session {
    return new Session(
      input.id,
      input.accountId,
      input.digest,
      new Date(input.establishedAt),
      new Date(input.establishedAt.getTime() + SESSION_LIFETIME_MS),
      null,
    );
  }

  static restore(input: RestoreSession): Session {
    return new Session(
      input.id,
      input.accountId,
      input.digest,
      new Date(input.establishedAt),
      new Date(input.expiresAt),
      input.revokedAt === null ? null : new Date(input.revokedAt),
    );
  }

  isValid(at: Date): boolean {
    return this.revokedAt === null && at < this.expiresAt;
  }

  revoke(at: Date): Session {
    if (this.revokedAt !== null) {
      return this;
    }
    if (at < this.establishedAt) {
      throw new Error('Session cannot be revoked before establishment');
    }

    return new Session(
      this.id,
      this.accountId,
      this.digest,
      this.establishedAt,
      this.expiresAt,
      new Date(at),
    );
  }
}
