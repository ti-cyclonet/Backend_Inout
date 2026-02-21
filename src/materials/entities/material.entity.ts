import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { MaterialImage } from './material-image.entity';
import { Category } from '../../categories/entities/category.entity';

@Entity({ name: 'materials', schema: 'manufacturing'} )
export class Material {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string; // Código del usuario principal

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  strCode: string; // Código autoincremental ABC-M-00001

  @Column({ type: 'varchar', length: 255, unique: false })
  strName: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  ingQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  fltPrice: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  ingMaxStock: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  ingMinStock: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  strUnitMeasure: string;

  @Column({ type: 'varchar', length: 50, nullable: false, default: '' })
  strDischargeUnit: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  dtmUpdateDate: Date;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'Active' })
  strStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  strLocation: string;

  @Column({ type: 'int', nullable: true })
  categoryId: number;

  @Column({ type: 'boolean', nullable: false, default: false })
  blnBulkUpload: boolean;

  @ManyToOne(() => Category, category => category.materials)
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  // Removed images relation since MaterialImage is now generic
}