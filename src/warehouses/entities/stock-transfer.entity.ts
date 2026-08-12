import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'stock_transfers', schema: 'manufacturing' })
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  transferCode: string;

  @Column({ type: 'uuid' })
  materialId: string;

  @Column({ type: 'varchar', length: 255 })
  materialName: string;

  @Column({ type: 'uuid' })
  fromWarehouseId: string;

  @Column({ type: 'varchar', length: 255 })
  fromWarehouseName: string;

  @Column({ type: 'uuid', nullable: true })
  fromLocationId: string;

  @Column({ type: 'uuid' })
  toWarehouseId: string;

  @Column({ type: 'varchar', length: 255 })
  toWarehouseName: string;

  @Column({ type: 'uuid', nullable: true })
  toLocationId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 50, default: 'completed' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
