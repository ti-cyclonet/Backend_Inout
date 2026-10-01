import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** PERCENT: % sobre el precio. FIXED: valor fijo descontado por unidad. */
export type PromotionDiscountType = 'PERCENT' | 'FIXED';
/** Dónde aplica: venta en tienda/panel (POS), MarketPlace o ambos. */
export type PromotionChannel = 'ALL' | 'POS' | 'MARKETPLACE';
/** A qué aplica: ítems puntuales (targets) o todo el catálogo. */
export type PromotionScope = 'ITEMS' | 'ALL';
export type PromotionTargetType = 'product' | 'material' | 'material_t' | 'kit' | 'combo' | 'category';

export interface PromotionTarget {
  type: PromotionTargetType;
  /** uuid del ítem, o id numérico de la categoría (como texto). */
  id: string;
}

/**
 * Promoción por % o valor fijo sobre productos, materiales de reventa, kits,
 * combos o categorías, con vigencia (fechas, días y franja horaria) y canal.
 * En cada línea se aplica solo la MEJOR promoción vigente (no se acumulan).
 * Ver promotion-engine.ts.
 */
@Entity({ name: 'promotions', schema: 'manufacturing' })
@Index(['strTenantId', 'strStatus'])
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 120 })
  strName: string;

  @Column({ type: 'text', nullable: true })
  strDescription: string | null;

  /** active | inactive */
  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'varchar', length: 10 })
  strDiscountType: PromotionDiscountType;

  /** PERCENT: 0-100. FIXED: pesos por unidad. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  fltValue: number;

  @Column({ type: 'varchar', length: 10, default: 'ITEMS' })
  strScope: PromotionScope;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  targets: PromotionTarget[];

  @Column({ type: 'varchar', length: 12, default: 'ALL' })
  strChannel: PromotionChannel;

  /** Vigencia en fecha de Bogotá (YYYY-MM-DD), inclusive. */
  @Column({ type: 'date' })
  dtmStartDate: string;

  @Column({ type: 'date', nullable: true })
  dtmEndDate: string | null;

  /** Días de la semana (0 = domingo … 6 = sábado). Null o vacío = todos. */
  @Column({ type: 'jsonb', nullable: true })
  weekdays: number[] | null;

  /** Franja horaria de Bogotá 'HH:MM' (ambas o ninguna). Si from > to, cruza la medianoche. */
  @Column({ type: 'varchar', length: 5, nullable: true })
  strTimeFrom: string | null;

  @Column({ type: 'varchar', length: 5, nullable: true })
  strTimeTo: string | null;

  @CreateDateColumn()
  dtmCreationDate: Date;

  @UpdateDateColumn()
  dtmUpdateDate: Date;
}
