import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Vistas de cada ítem de la tienda en línea (producto, material de reventa o
 * combo): cuántas veces un visitante abrió su detalle. Las ventas no se
 * guardan aquí: se cuentan de las ventas reales (manufacturing.sales).
 */
@Entity({ name: 'marketplace_item_stats', schema: 'manufacturing' })
export class MarketplaceItemStat {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  strTenantId: string;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  strItemId: string;

  @Column({ type: 'int', default: 0 })
  ingViews: number;

  @UpdateDateColumn({ type: 'timestamp' })
  dtmUpdated: Date;
}
