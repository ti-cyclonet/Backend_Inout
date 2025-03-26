import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'materials-t', schema: 'manufacturing'} )
export class MaterialT {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  strName: string;

  @Column({
    type: 'text',
    default: '/assets/img/default.jpg',
  })
  strUrlImage: string;

  @Column({ type: 'int', nullable: false, default: 0 })
  ingQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  fltPrice: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strDescription: string;

  @Column({ type: 'smallint', nullable: false, default: 0 })
  ingMaxStock: number;

  @Column({ type: 'smallint', nullable: false, default: 0 })
  ingMinStock: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  strUnitMeasure: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'Active' })
  strStatus: string;
}
