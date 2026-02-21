import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'product_composition', schema: 'manufacturing' })
export class ProductComposition {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'uuid' })
  strProductId: string;

  @Column({ type: 'uuid' })
  strMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;
}
