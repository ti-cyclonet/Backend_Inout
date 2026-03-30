import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

@Entity({ name: 'materials-t', schema: 'manufacturing'} )
@Unique(['strName', 'strTenantId'])
@Unique(['strCode'])
export class MaterialT {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strCode: string; // Código autoincremental ABC-T-00001

  @Column({ type: 'varchar', length: 255 })
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

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  dtmUpdateDate: Date;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'Active' })
  strStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  strLocation: string;

  @Column({ type: 'varchar', length: 50, nullable: false })
  strTenantId: string;

  @Column({ type: 'int', nullable: true })
  categoryId: number;

  @ManyToOne(() => Category, category => category.materialsT)
  @JoinColumn({ name: 'categoryId' })
  category: Category;
}