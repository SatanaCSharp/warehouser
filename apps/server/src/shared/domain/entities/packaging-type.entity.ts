import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'packaging_types' })
export class PackagingTypeEntity {
  @PrimaryColumn('varchar', { length: 32 })
  id!: string;

  @Column('varchar', { length: 100 })
  label!: string;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
