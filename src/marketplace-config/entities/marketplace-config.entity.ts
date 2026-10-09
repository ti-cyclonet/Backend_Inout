import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'marketplace_config', schema: 'manufacturing' })
export class MarketplaceConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  @Column({ type: 'varchar', length: 255, unique: true, nullable: true })
  slug: string;

  @Column({ type: 'json' })
  selectedProductIds: string[];

  @Column({ type: 'varchar', length: 20, nullable: true })
  whatsapp: string;

  @Column({ type: 'varchar', length: 7, nullable: true })
  brandColor: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  welcomeMessage: string;

  @Column({ type: 'json', nullable: true })
  schedule: { day: string; open: string; close: string; active: boolean }[];

  @Column({ type: 'varchar', length: 10, default: 'grid' })
  displayMode: string;

  /** Formas de pago que ofrece la tienda (ver orders/payment-plans.ts). Null = valores por defecto. */
  @Column({ type: 'json', nullable: true })
  paymentOptions: Record<string, any> | null;

  /** Pedidos programados: horario de entregas, franjas y cupos (ver orders/scheduling.ts). */
  @Column({ type: 'json', nullable: true })
  scheduling: Record<string, any> | null;

  /** Textos de la modal de agradecimiento al entregar (ver orders/thanks-messages.ts). Null = por defecto. */
  @Column({ type: 'json', nullable: true })
  thanksMessages: Record<string, any> | null;

  /** Información de la carta: bloques (proteínas, salsas…), subtítulo, zonas de domicilio, solo domicilios. */
  @Column({ type: 'json', nullable: true })
  menuExtras: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}