import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'product_productions', schema: 'manufacturing' })
export class ProductProduction {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 100 })
  strProductId: string;

  @Column({ type: 'date' })
  dtmDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltUnitPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strBatchReference: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}
