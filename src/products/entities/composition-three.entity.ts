import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'composition_three', schema: 'manufacturing' })
export class CompositionThree {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'uuid' })
  strProductId: string;

  @Column({ type: 'uuid' })
  strTransformedMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;
}
