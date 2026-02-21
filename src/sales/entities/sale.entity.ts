import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity({ name: 'sales', schema: 'manufacturing' })
@Unique(['strInvoiceCode', 'strTenantId'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strInvoiceCode: string;

  @Column({ type: 'varchar', length: 100 })
  strProductId: string;

  @Column({ type: 'date' })
  dtmDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltUnitPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  @Column({ type: 'jsonb', nullable: true })
  items: any;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}
