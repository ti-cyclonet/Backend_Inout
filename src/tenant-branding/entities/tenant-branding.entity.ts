import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Identidad visual del negocio (tenant): el logo que se usa en documentos
 * PDF, el MarketPlace y donde se requiera. No es un parámetro del período
 * (esos viven en Authoriza y cambian por período): el logo es del negocio.
 */
@Entity({ name: 'tenant_branding', schema: 'manufacturing' })
export class TenantBranding {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  /** URL original en Cloudinary (https). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  /** public_id en Cloudinary, para borrar el anterior al reemplazarlo. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  logoPublicId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
