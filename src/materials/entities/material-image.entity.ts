import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Material } from '../../materials/entities/material.entity';

@Entity({ name: 'material_images', schema: 'manufacturing' })
export class MaterialImage {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'uuid' })
  strMaterialId: string;

  @Column({ type: 'text' })
  strImageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @ManyToOne(() => Material, material => material.images)
  @JoinColumn({ name: 'strMaterialId' })
  material: Material;
}