import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Combo } from './combo.entity';

export type ComboItemType = 'product' | 'material' | 'material_t';

/**
 * Cómo se cuenta la cantidad del componente:
 * - SALE: unidades del producto, o presentaciones de venta del material de
 *   reventa (igual que en un pedido).
 * - STOCK: unidad de medida del material (insumos/empaque que no se venden
 *   solos: canasta, moño). Solo en kits armados.
 */
export type ComboQuantityMode = 'SALE' | 'STOCK';

@Entity({ name: 'combo_components', schema: 'manufacturing' })
export class ComboComponent {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'uuid' })
  strComboId: string;

  @ManyToOne(() => Combo, (c) => c.components, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'strComboId' })
  combo: Combo;

  @Column({ type: 'varchar', length: 20 })
  strItemType: ComboItemType;

  @Column({ type: 'uuid' })
  strItemId: string;

  @Column({ type: 'decimal', precision: 10, scale: 3 })
  fltQuantity: number;

  @Column({ type: 'varchar', length: 10, default: 'SALE' })
  strQuantityMode: ComboQuantityMode;
}
