import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Index } from 'typeorm';

/**
 * Funciones que el negocio activó o apagó (ver business-modules.catalog.ts).
 * Solo guarda lo que el negocio cambió; lo demás sigue el valor por defecto
 * de su sector.
 */
@Entity({ name: 'tenant_modules', schema: 'manufacturing' })
export class TenantModules {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  /** { kitchen: true, credit: false, … } */
  @Column({ type: 'json', nullable: true })
  modules: Record<string, boolean> | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
