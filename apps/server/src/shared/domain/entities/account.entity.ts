import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'accounts' })
export class AccountEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'user_id' })
  userId!: string;

  @Column('varchar', { name: 'normalized_email', length: 254 })
  normalizedEmail!: string;

  @Column('varchar', { name: 'password_hash', length: 512 })
  passwordHash!: string;

  @Column('varchar', { name: 'password_hash_algorithm', length: 32 })
  passwordHashAlgorithm!: string;

  @Column('jsonb', { name: 'password_hash_parameters' })
  passwordHashParameters!: Record<string, number | string>;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
