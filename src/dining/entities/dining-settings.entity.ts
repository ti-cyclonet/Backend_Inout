import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/** Reglas de reservas del negocio (duración, tolerancia, anticipo…). Ver dining-rules.ts. */
@Entity({ name: 'dining_settings', schema: 'manufacturing' })
export class DiningSettingsEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  @Column({ type: 'jsonb', nullable: true })
  settings: Record<string, any> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
