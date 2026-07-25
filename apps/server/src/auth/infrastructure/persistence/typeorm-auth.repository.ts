import {
  Account,
  AccountId,
  AccountRepository,
  AuthRegistrationRepository,
  EmailAddress,
  RegisteredIdentity,
  Session,
  SessionDigest,
  SessionId,
  SessionRepository,
} from 'auth/domain';
import {
  AuthEmailAlreadyRegisteredError,
  AuthRegistrationUnavailableError,
  AuthSessionUnavailableError,
  AuthSignOutUnavailableError,
} from 'auth/errors';
import { DataSource } from 'typeorm';

interface AccountRow {
  id: string;
  normalized_email: string;
  password_hash: string;
  password_hash_algorithm: string;
  password_hash_parameters: Record<string, number | string>;
}

interface SessionRow {
  id: string;
  account_id: string;
  secret_digest: Buffer;
  established_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export class TypeOrmAuthRepository
  implements AccountRepository, AuthRegistrationRepository, SessionRepository
{
  constructor(private readonly dataSource: DataSource) {}

  async registerIdentity(identity: RegisteredIdentity): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        const now = new Date();
        await manager.query(
          `INSERT INTO accounts
          (id, user_id, normalized_email, password_hash,
           password_hash_algorithm, password_hash_parameters, created_at, updated_at)
         VALUES ($1, $1, $2, $3, $4, $5, $6, $6)`,
          [
            identity.account.id.value,
            identity.account.email.value,
            identity.account.credential.hash,
            identity.account.credential.algorithm,
            JSON.stringify(identity.account.credential.parameters),
            now,
          ],
        );
        await manager.query(
          `INSERT INTO users (id, account_id, created_at, updated_at)
         VALUES ($1, $1, $2, $2)`,
          [identity.user.id.value, now],
        );
        await this.insertSession(manager, identity.session);
      });
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505' &&
        'constraint' in error &&
        error.constraint === 'uq_accounts_normalized_email'
      ) {
        throw AuthEmailAlreadyRegisteredError();
      }
      throw AuthRegistrationUnavailableError(error);
    }
  }

  async findByNormalizedEmail(email: EmailAddress): Promise<Account | null> {
    const rows: AccountRow[] = await this.dataSource.query(
      `SELECT id, normalized_email, password_hash, password_hash_algorithm,
              password_hash_parameters
         FROM accounts WHERE normalized_email = $1`,
      [email.value],
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    return Account.create({
      id: row.id,
      email: row.normalized_email,
      credential: {
        hash: row.password_hash,
        algorithm: row.password_hash_algorithm,
        parameters: row.password_hash_parameters,
      },
    });
  }

  async create(session: Session): Promise<void> {
    try {
      await this.insertSession(this.dataSource.manager, session);
    } catch (error) {
      throw AuthSessionUnavailableError(error);
    }
  }

  async findValidByDigest(
    digest: SessionDigest,
    at: Date,
  ): Promise<Session | null> {
    let rows: SessionRow[];
    try {
      rows = await this.dataSource.query(
        `SELECT id, account_id, secret_digest, established_at, expires_at, revoked_at
           FROM sessions
          WHERE secret_digest = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [Buffer.from(digest.value), at],
      );
    } catch (error) {
      throw AuthSessionUnavailableError(error);
    }
    const row = rows[0];
    if (!row) {
      return null;
    }

    return Session.restore({
      id: SessionId.create(row.id),
      accountId: AccountId.create(row.account_id),
      digest: SessionDigest.create(row.secret_digest),
      establishedAt: row.established_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    });
  }

  async revokeByDigest(digest: SessionDigest, at: Date): Promise<boolean> {
    let result: [unknown[], number];
    try {
      result = await this.dataSource.query(
        `UPDATE sessions SET revoked_at = $2
          WHERE secret_digest = $1 AND revoked_at IS NULL AND expires_at > $2`,
        [Buffer.from(digest.value), at],
      );
    } catch (error) {
      throw AuthSignOutUnavailableError(error);
    }
    return result[1] === 1;
  }

  private async insertSession(
    executor: Pick<DataSource['manager'], 'query'>,
    session: Session,
  ): Promise<void> {
    await executor.query(
      `INSERT INTO sessions
        (id, account_id, secret_digest, established_at, expires_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id.value,
        session.accountId.value,
        Buffer.from(session.digest.value),
        session.establishedAt,
        session.expiresAt,
        session.revokedAt,
      ],
    );
  }
}
