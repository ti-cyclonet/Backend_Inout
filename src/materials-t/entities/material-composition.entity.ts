import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { MaterialT } from './material-t.entity';
import { Material } from '../../materials/entities/material.entity';

@Entity({ name: 'compositionOne', schema: 'manufacturing' })
export class CompositionOne {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'uuid' })
  strMaterialTId: string;

  @Column({ type: 'uuid' })
  strComponentMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @ManyToOne(() => MaterialT)
  @JoinColumn({ name: 'strMaterialTId' })
  materialT: MaterialT;

  @ManyToOne(() => Material)
  @JoinColumn({ name: 'strComponentMaterialId' })
  componentMaterial: Material;
}