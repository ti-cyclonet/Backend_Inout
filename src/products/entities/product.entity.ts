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

  /** Mano de obra DIRECTA por unidad (opcional): costo trazable a este
   * producto específico (ej. horas de un operario dedicadas a fabricarlo),
   * distinto de la nómina indirecta que ya se prorratea vía overhead. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  fltDirectLaborCost: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ingQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ingReservedStock: number;

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

  /** Opcional: si aparece en el catálogo del MarketPlace del tenant. Por
   * defecto true para no cambiar el comportamiento de productos existentes. */
  @Column({ type: 'boolean', nullable: false, default: true })
  blnMarketplaceVisible: boolean;

  /** Fabricación bajo pedido: se puede pedir sin stock; el faltante queda
   * "por fabricar" en el pedido (ver common/order-stock.ts). */
  @Column({ type: 'boolean', nullable: false, default: false })
  blnMadeToOrder: boolean;

  /** Horas que toma fabricarlo (para estimar cuándo estará listo un pedido). */
  @Column({ type: 'int', nullable: true })
  intProductionLeadHours: number | null;

  @ManyToOne(() => Category)
  @JoinColumn({ name: 'intCategoryId' })
  category: Category;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}
