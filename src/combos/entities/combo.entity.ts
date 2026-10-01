import { Entity, PrimaryGeneratedColumn, Column, OneToMany, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { ComboComponent } from './combo-component.entity';

/**
 * Combo o kit que vende el negocio, armado con productos y/o materiales.
 *
 * - VIRTUAL: no tiene stock propio. Al venderse se expande en sus
 *   componentes (ver combo-lines.ts), que son los que reservan y descuentan
 *   stock. Ej: "Hamburguesa + papas + gaseosa".
 * - KIT: kit armado con stock propio (anchetas, canastas). Los componentes se
 *   descuentan al ARMAR el lote (combos.service#assemble) y al venderse se
 *   mueve el stock del kit (itemType 'kit' en common/stock-availability.ts).
 *
 * Los nombres de columna siguen los de Product (strId, strTenantId,
 * ingQuantity, ingReservedStock) porque el kit usa los mismos helpers de stock.
 */
export type ComboType = 'VIRTUAL' | 'KIT';

@Entity({ name: 'combos', schema: 'manufacturing' })
@Index(['strTenantId', 'strStatus'])
export class Combo {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strCode: string;

  @Column({ type: 'varchar', length: 120 })
  strName: string;

  @Column({ type: 'text', nullable: true })
  strDescription: string | null;

  @Column({ type: 'varchar', length: 10 })
  strType: ComboType;

  /** Precio de venta del combo (lo fija el negocio). */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  fltPrice: number;

  /** KIT: costo promedio ponderado de las unidades armadas en stock. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  fltCost: number;

  /** KIT: unidades armadas. VIRTUAL: siempre 0. */
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ingQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  ingReservedStock: number;

  /** active | inactive (inactive: no se vende ni se muestra en el MarketPlace). */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'boolean', default: true })
  blnMarketplaceVisible: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strImageUrl: string | null;

  /** public_id en Cloudinary, para borrar la imagen al reemplazarla o al borrar el combo. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  strImagePublicId: string | null;

  @OneToMany(() => ComboComponent, (c) => c.combo, { cascade: true })
  components: ComboComponent[];

  @CreateDateColumn()
  dtmCreationDate: Date;

  @UpdateDateColumn()
  dtmUpdateDate: Date;
}
