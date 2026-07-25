import { Session } from 'auth/domain/entities/session';
import { SessionDigest } from 'auth/domain/value-objects/session-digest';

export abstract class SessionRepository {
  abstract create(session: Session): Promise<void>;
  abstract findValidByDigest(
    digest: SessionDigest,
    at: Date,
  ): Promise<Session | null>;
  abstract revokeByDigest(digest: SessionDigest, at: Date): Promise<boolean>;
}
