import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'sessions' })
export class SessionEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'account_id' })
  accountId!: string;

  @Column('bytea', { name: 'secret_digest' })
  secretDigest!: Buffer;

  @Column('timestamptz', { name: 'established_at' })
  establishedAt!: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expiresAt!: Date;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt!: Date | null;
}
