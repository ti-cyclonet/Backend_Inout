import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'composition_two', schema: 'manufacturing' })
export class CompositionTwo {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'uuid' })
  strProductId: string;

  @Column({ type: 'uuid' })
  strMaterialId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;
}
