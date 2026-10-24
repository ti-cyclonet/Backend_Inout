import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { PaymentMethod } from './receivable-payment.entity';

export type ReceivableVoucherStatus = 'PENDIENTE_VERIFICACION' | 'VERIFICADO' | 'RECHAZADO';

/**
 * Comprobante de pago que sube el cliente desde el enlace del recordatorio de
 * cartera. Queda por verificar: al verificarlo, el negocio registra el abono
 * (ReceivablePayment) y aquí queda su id.
 */
@Entity({ name: 'receivable_vouchers', schema: 'manufacturing' })
@Index(['tenantId', 'status'])
@Index(['receivableId'])
export class ReceivableVoucher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'uuid' })
  receivableId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'varchar', length: 500 })
  voucherUrl: string;

  @Column({ type: 'varchar', length: 24, default: 'PENDIENTE_VERIFICACION' })
  status: ReceivableVoucherStatus;

  @Column({ type: 'varchar', length: 300, nullable: true })
  rejectReason: string | null;

  /** Abono que se registró al verificarlo. */
  @Column({ type: 'uuid', nullable: true })
  paymentId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
