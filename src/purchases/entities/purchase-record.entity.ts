import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';
import { Supplier } from '../../suppliers/entities/supplier.entity';

@Entity({ name: 'purchase_records', schema: 'manufacturing' })
export class PurchaseRecord {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'uuid' })
  strMaterialId: string;

  @Column({ type: 'uuid' })
  strSupplierId: string;

  @Column({ type: 'date' })
  dtmDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltUnitPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  strDocument: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'strMaterialId' })
  material: Material;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'strSupplierId' })
  supplier: Supplier;
}
