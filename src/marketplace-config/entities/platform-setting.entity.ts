import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Ajustes de la plataforma que no pertenecen a ningún negocio (p. ej. el tema
 * de la vitrina CycloNet Market). Una fila por clave.
 */
@Entity({ name: 'platform_settings', schema: 'manufacturing' })
export class PlatformSetting {
  @PrimaryColumn({ type: 'varchar', length: 60 })
  key: string;

  @Column({ type: 'json', nullable: true })
  value: any;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
