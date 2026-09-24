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

  /** Opcional: si aparece en el catálogo del MarketPlace del tenant. Por
   * defecto true para no cambiar el comportamiento de materiales existentes. */
  @Column({ type: 'boolean', nullable: false, default: true })
  blnMarketplaceVisible: boolean;

  // ── Reventa (redistribución, ej. tiendas de barrio) ──────────────────────
  // El stock (ingQuantity) y el costo (fltPrice) están en strUnitMeasure; la
  // reventa se hace por PRESENTACIÓN (ej. "Bolsa 1 kg" = 1000 g).

  /** Material habilitado para venderse tal cual (Ventas, Pedidos, MarketPlace). */
  @Column({ type: 'boolean', nullable: false, default: false })
  blnForResale: boolean;

  /** Nombre de la presentación de venta, ej. "Bolsa 1 kg". */
  @Column({ type: 'varchar', length: 100, nullable: true })
  strSalePresentation: string;

  /** Cantidad en strUnitMeasure que contiene una presentación (ej. 1000). */
  @Column({ type: 'decimal', precision: 12, scale: 3, nullable: false, default: 0 })
  fltPresentationQuantity: number;

  /** Precio de venta por presentación (no puede ser menor al sugerido). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: false, default: 0 })
  fltSalePrice: number;

  /** Presentaciones que se planea vender al mes: prorratea el costo indirecto. */
  @Column({ type: 'int', nullable: false, default: 0 })
  ingPlannedMonthlyUnits: number;

  /** Stock reservado por pedidos confirmados, en strUnitMeasure. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  ingReservedStock: number;

  @ManyToOne(() => Category, category => category.materialsT)
  @JoinColumn({ name: 'categoryId' })
  category: Category;
}