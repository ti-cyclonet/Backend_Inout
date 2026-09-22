import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Product } from '../../products/entities/product.entity';

/**
 * Plan de producción: cuántas unidades de un producto se planea fabricar en
 * un período/subperíodo dado. Reemplaza el campo "Unidades que planeas
 * producir al mes" que antes se re-adivinaba cada vez en el formulario de
 * creación/edición del producto — ahora es un valor único por
 * (tenant, período, producto), configurado en Settings, y reutilizado en
 * todos lados donde se calcule el costo indirecto por unidad.
 */
@Entity({ name: 'production_plans', schema: 'manufacturing' })
@Unique(['strTenantId', 'periodId', 'productId'])
export class ProductionPlan {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  // Id del período o subperíodo (en Authoriza, la fuente de verdad de
  // períodos). No hay FK real porque vive en otra base de datos/servicio.
  @Column({ type: 'varchar', length: 100 })
  periodId: string;

  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fltPlannedMonthlyUnits: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  dtmUpdateDate: Date;
}
