import { Entity, PrimaryGeneratedColumn, Column, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Plan de producción / venta: cuántas unidades de un ítem se planea
 * producir (productos) o vender (materiales y materiales compuestos de
 * reventa, en presentaciones) en un período/subperíodo dado. Es un valor
 * único por (tenant, período, tipo, ítem), configurado en Settings, y se
 * reutiliza donde se calcule el costo indirecto por unidad.
 */
@Entity({ name: 'production_plans', schema: 'manufacturing' })
@Unique(['strTenantId', 'periodId', 'itemType', 'productId'])
export class ProductionPlan {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  // Id del período o subperíodo (en Authoriza, la fuente de verdad de
  // períodos). No hay FK real porque vive en otra base de datos/servicio.
  @Column({ type: 'varchar', length: 100 })
  periodId: string;

  /** 'product' | 'material' | 'material_t' (reventa). */
  @Column({ type: 'varchar', length: 20, default: 'product' })
  itemType: string;

  /**
   * Id del ítem (producto, material o material compuesto según itemType).
   * Conserva el nombre histórico de la columna; ya no tiene FK a productos
   * porque también apunta a materiales.
   */
  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fltPlannedMonthlyUnits: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  dtmUpdateDate: Date;
}
