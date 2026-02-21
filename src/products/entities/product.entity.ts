import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Category } from '../../categories/entities/category.entity';

@Entity({ name: 'products', schema: 'manufacturing' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strCode: string;

  @Column({ type: 'varchar', length: 100 })
  strName: string;

  @Column({ type: 'text', nullable: true })
  strDescription: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fltCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ingQuantity: number;

  @Column({ type: 'varchar', length: 50 })
  strMeasurementUnit: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ingStockMin: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  ingStockMax: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  strLocation: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'int', nullable: true })
  intCategoryId: number;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'intCategoryId' })
  category: Category;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}
