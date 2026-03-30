import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';

@Entity({ name: 'inventory_movements', schema: 'manufacturing' })
export class InventoryMovement {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'uuid', nullable: true })
  strMaterialId: string;

  @Column({ type: 'uuid', nullable: true })
  strTransformedMaterialId: string;

  @Column({ type: 'uuid', nullable: true })
  strProductId: string;

  @Column({ type: 'varchar', length: 20 })
  strType: string; // 'IN' | 'OUT'

  @Column({ type: 'varchar', length: 50 })
  strReason: string; // 'PURCHASE' | 'PRODUCTION' | 'ADJUSTMENT' | 'TRANSFORMED_MATERIAL' | 'SALE'

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltUnitPrice: number;

  @Column({ type: 'uuid', nullable: true })
  strReferenceId: string; // ID del material compuesto o compra

  @Column({ type: 'varchar', length: 255, nullable: true })
  strNotes: string;

  @Column({ type: 'date', nullable: true })
  dtmDate: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'strMaterialId' })
  material: Material;
}
