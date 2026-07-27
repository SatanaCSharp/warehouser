import {
  type MigrationInterface,
  type QueryRunner,
  Table,
  TableCheck,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateAuthSchema01 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'accounts',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'user_id', type: 'uuid' },
          { name: 'normalized_email', type: 'varchar', length: '254' },
          { name: 'password_hash', type: 'varchar', length: '512' },
          { name: 'password_hash_algorithm', type: 'varchar', length: '32' },
          { name: 'password_hash_parameters', type: 'jsonb' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'uq_accounts_user_id',
            columnNames: ['user_id'],
          }),
          new TableUnique({
            name: 'uq_accounts_normalized_email',
            columnNames: ['normalized_email'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_accounts_user_identity_pair',
            expression: 'user_id = id',
          }),
          new TableCheck({
            name: 'chk_accounts_normalized_email',
            expression:
              'normalized_email = lower(btrim(normalized_email)) AND octet_length(normalized_email) <= 254',
          }),
          new TableCheck({
            name: 'chk_accounts_password_hash_parameters_object',
            expression: "jsonb_typeof(password_hash_parameters) = 'object'",
          }),
        ],
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'account_id', type: 'uuid' },
          {
            name: 'created_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamptz',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
        uniques: [
          new TableUnique({
            name: 'uq_users_account_id',
            columnNames: ['account_id'],
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_users_account_identity_pair',
            expression: 'account_id = id',
          }),
        ],
      }),
    );

    await queryRunner.createForeignKey(
      'accounts',
      new TableForeignKey({
        name: 'fk_accounts_user_id',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        deferrable: 'INITIALLY DEFERRED',
      }),
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        name: 'fk_users_account_id',
        columnNames: ['account_id'],
        referencedTableName: 'accounts',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
        deferrable: 'INITIALLY DEFERRED',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'sessions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true },
          { name: 'account_id', type: 'uuid' },
          { name: 'secret_digest', type: 'bytea' },
          { name: 'established_at', type: 'timestamptz' },
          { name: 'expires_at', type: 'timestamptz' },
          { name: 'revoked_at', type: 'timestamptz', isNullable: true },
        ],
        uniques: [
          new TableUnique({
            name: 'uq_sessions_secret_digest',
            columnNames: ['secret_digest'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'fk_sessions_account_id',
            columnNames: ['account_id'],
            referencedTableName: 'accounts',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
        checks: [
          new TableCheck({
            name: 'chk_sessions_secret_digest_length',
            expression: 'octet_length(secret_digest) = 32',
          }),
          new TableCheck({
            name: 'chk_sessions_expiry_order',
            expression: 'expires_at > established_at',
          }),
          new TableCheck({
            name: 'chk_sessions_revocation_order',
            expression: 'revoked_at IS NULL OR revoked_at >= established_at',
          }),
        ],
      }),
    );

    await queryRunner.createIndex(
      'sessions',
      new TableIndex({
        name: 'idx_sessions_account_id',
        columnNames: ['account_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('sessions');
    await queryRunner.dropForeignKey('accounts', 'fk_accounts_user_id');
    await queryRunner.dropForeignKey('users', 'fk_users_account_id');
    await queryRunner.dropTable('users');
    await queryRunner.dropTable('accounts');
  }
}
