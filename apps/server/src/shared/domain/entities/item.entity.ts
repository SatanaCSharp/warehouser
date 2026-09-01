import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'items' })
export class ItemEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'warehouse_id' })
  warehouseId!: string;

  @Column('text')
  sku!: string;

  @Column('text')
  description!: string;

  @Column('varchar', { name: 'unit_of_measure', length: 32 })
  unitOfMeasure!: string;

  @Column('integer', { name: 'on_hand_quantity', default: 0 })
  onHandQuantity!: number;

  @Column('timestamptz', { name: 'deactivated_at', nullable: true })
  deactivatedAt!: Date | null;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;

  @Column('timestamptz', { name: 'updated_at' })
  updatedAt!: Date;
}
