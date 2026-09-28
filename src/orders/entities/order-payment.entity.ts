import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { PAYMENT_METHODS, PaymentMethod } from '../../credit/entities/receivable-payment.entity';

export { PAYMENT_METHODS };

export const ORDER_PAYMENT_STATUSES = ['PENDIENTE_VERIFICACION', 'VERIFICADO', 'RECHAZADO'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

/**
 * Pago (anticipo, abono o saldo) de un pedido. El cliente sube un comprobante
 * desde el MarketPlace (queda PENDIENTE_VERIFICACION) o el negocio lo registra
 * en el panel (nace VERIFICADO). Solo los VERIFICADOS suman a orders.amountPaid.
 */
@Entity({ name: 'order_payments', schema: 'manufacturing' })
@Index(['tenantId', 'orderId'])
export class OrderPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  /** Comprobante en Cloudinary (imagen o PDF). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  voucherUrl: string | null;

  /** CLIENTE (subido en el MarketPlace) | NEGOCIO (registrado en el panel) */
  @Column({ type: 'varchar', length: 10 })
  source: 'CLIENTE' | 'NEGOCIO';

  @Column({ type: 'varchar', length: 25 })
  status: OrderPaymentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'text', nullable: true })
  rejectReason: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  verifiedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
