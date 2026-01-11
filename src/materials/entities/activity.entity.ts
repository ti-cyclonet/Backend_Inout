import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity({ name: 'activities', schema: 'manufacturing' })
export class Activity {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 100 })
  strType: string; // 'material_created', 'material_updated', 'material_deleted'

  @Column({ type: 'varchar', length: 255 })
  strTitle: string;

  @Column({ type: 'varchar', length: 50 })
  strIcon: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  @Column({ type: 'uuid', nullable: true })
  strEntityId: string; // ID del material relacionado
}