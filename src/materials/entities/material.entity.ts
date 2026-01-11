import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { MaterialImage } from './material-image.entity';

@Entity({ name: 'materials', schema: 'manufacturing'} )
export class Material {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string; // Código del usuario principal

  @Column({ type: 'varchar', length: 255, unique: false })
  strName: string;

  @Column({ type: 'int', nullable: false, default: 0 })
  ingQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false, default: 0 })
  fltPrice: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  strDescription: string;

  @Column({ type: 'int', nullable: false, default: 0 })
  ingMaxStock: number;

  @Column({ type: 'int', nullable: false, default: 0 })
  ingMinStock: number;

  @Column({ type: 'varchar', length: 50, nullable: false })
  strUnitMeasure: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @Column({ type: 'varchar', length: 20, nullable: false, default: 'Active' })
  strStatus: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  strLocation: string;

  @OneToMany(() => MaterialImage, image => image.material)
  images: MaterialImage[];
}
