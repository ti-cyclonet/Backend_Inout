import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, Unique } from 'typeorm';

export const BARCODE_ITEM_TYPES = ['product', 'material', 'material_t', 'combo'] as const;
export type BarcodeItemType = (typeof BARCODE_ITEM_TYPES)[number];

/**
 * Códigos de barras de los ítems que se venden (productos y sus
 * presentaciones, materiales de reventa, compuestos y combos/kits).
 * Un ítem puede tener varios códigos (dos proveedores, cambio de empaque);
 * un código pertenece a un solo ítem dentro del negocio.
 */
@Entity({ name: 'item_barcodes', schema: 'manufacturing' })
@Unique(['strTenantId', 'strCode'])
@Index(['strTenantId', 'strItemId'])
export class ItemBarcode {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 64 })
  strCode: string;

  /** product | material | material_t | combo (los kits también son combos). */
  @Column({ type: 'varchar', length: 20 })
  strItemType: BarcodeItemType;

  @Column({ type: 'uuid' })
  strItemId: string;

  @CreateDateColumn({ type: 'timestamp' })
  dtmCreationDate: Date;
}
