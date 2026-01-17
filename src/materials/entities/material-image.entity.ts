import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'images', schema: 'manufacturing' })
export class MaterialImage {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50 })
  strEntityType: string; // 'material', 'material-t', 'product', 'supplier'

  @Column({ type: 'uuid' })
  strEntityId: string; // ID de la entidad relacionada

  @Column({ type: 'text' })
  strImageUrl: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  strStatus: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;
}

// Keep backward compatibility
export { MaterialImage as Image };