import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Cuenta de Mercado Pago de un negocio (una por tenant) y su pedido de aviso
 * mientras los pagos en línea están en configuración. Los tokens van cifrados
 * (ver encryptToken); nunca salen del backend.
 */
@Entity({ name: 'tenant_payment_accounts', schema: 'manufacturing' })
export class TenantPaymentAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  tenantId: string;

  @Column({ type: 'varchar', length: 20, default: 'MERCADOPAGO' })
  provider: 'MERCADOPAGO';

  /** NONE (solo pidió aviso) | CONNECTED | DISCONNECTED | ERROR (el token dejó de servir). */
  @Column({ type: 'varchar', length: 20, default: 'NONE' })
  status: 'NONE' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

  /** user_id de la cuenta de Mercado Pago del negocio. */
  @Column({ type: 'varchar', length: 50, nullable: true })
  providerUserId: string | null;

  @Column({ type: 'text', nullable: true })
  accessTokenEnc: string | null;

  @Column({ type: 'text', nullable: true })
  refreshTokenEnc: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  publicKey: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  connectedAt: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  connectedBy: string | null;

  /** El negocio ofrece pagar en línea en su tienda (lo puede apagar sin desconectar la cuenta). */
  @Column({ type: 'boolean', default: true })
  enabledForStore: boolean;

  /** "Avísame cuando esté disponible": a quién y cuándo lo pidió, y cuándo se le avisó. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  notifyEmail: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  notifyRequestedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  notifiedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
