import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { GiftCardStatus } from './gift-cards';

/**
 * Bono de regalo de una tienda (ver gift-cards.ts). Nace PENDIENTE con el
 * pedido que lo compra, pasa a ACTIVO cuando ese pedido queda pagado o se
 * factura, y se usa como pago en pedidos del mismo tenant hasta agotar el
 * saldo o vencer. Solo una cuenta de cliente (clienteInout) puede usarlo.
 */
@Entity({ name: 'gift_cards', schema: 'manufacturing' })
@Index(['tenantId', 'status'])
@Index(['tenantId', 'recipientUserId'])
export class GiftCard {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  /** BONO-XXXX-XXXX-XXXX (único en todo el sistema). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balance: number;

  @Column({ type: 'varchar', length: 12, default: 'PENDIENTE' })
  status: GiftCardStatus;

  /** Pedido con el que se compró. */
  @Index()
  @Column({ type: 'uuid' })
  purchaseOrderId: string;

  /** Cuenta de quien lo compró (null si compró como invitado). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  purchaserUserId: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  purchaserName: string | null;

  @Column({ type: 'varchar', length: 80 })
  recipientName: string;

  /** Si se dio, el bono aparece solo en la cuenta con ese correo. */
  @Column({ type: 'varchar', length: 120, nullable: true })
  recipientEmail: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  recipientPhone: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  senderName: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message: string | null;

  /** Cuenta de cliente que lo reclamó o lo usó por primera vez (desde ahí, solo ella lo usa). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  recipientUserId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

export const GIFT_CARD_MOVEMENTS = ['EMISION', 'ACTIVACION', 'USO', 'DEVOLUCION', 'ANULACION', 'RECLAMO'] as const;
export type GiftCardMovementType = (typeof GIFT_CARD_MOVEMENTS)[number];

/** Historial de cada bono: emisión, activación, usos, devoluciones, anulación. */
@Entity({ name: 'gift_card_movements', schema: 'manufacturing' })
@Index(['tenantId', 'giftCardId'])
export class GiftCardMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'uuid' })
  giftCardId: string;

  @Column({ type: 'varchar', length: 12 })
  type: GiftCardMovementType;

  /** Valor del movimiento (USO resta, DEVOLUCION suma; 0 en los demás). */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  actorId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
