import { Session } from 'auth/domain/entities/session.js';
import { AccountId, SessionId } from 'auth/domain/value-objects/identity-id.js';
import { SessionDigest } from 'auth/domain/value-objects/session-digest.js';
import { SessionEntity } from 'shared/domain/entities/session.entity.js';

export const toSession = (entity: SessionEntity): Session =>
  Session.restore({
    id: SessionId.create(entity.id),
    accountId: AccountId.create(entity.accountId),
    digest: SessionDigest.create(entity.secretDigest),
    establishedAt: entity.establishedAt,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt,
  });

export const toSessionEntity = (session: Session): Partial<SessionEntity> => ({
  id: session.id.value,
  accountId: session.accountId.value,
  secretDigest: Buffer.from(session.digest.value),
  establishedAt: session.establishedAt,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt,
});
