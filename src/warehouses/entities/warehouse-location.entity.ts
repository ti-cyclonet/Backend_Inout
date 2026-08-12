import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Warehouse } from './warehouse.entity';

@Entity({ name: 'warehouse_locations', schema: 'manufacturing' })
export class WarehouseLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column('uuid')
  warehouseId: string;

  @ManyToOne(() => Warehouse, (warehouse) => warehouse.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: Warehouse;

  @Column({ type: 'varchar', length: 100 })
  name: string; // e.g. "Pasillo A - Estante 3 - Bin 2"

  @Column({ type: 'varchar', length: 50, nullable: true })
  aisle: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shelf: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bin: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
