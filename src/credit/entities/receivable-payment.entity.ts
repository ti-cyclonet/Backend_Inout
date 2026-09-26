import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/** Medios de pago aceptados (contado y abonos a cartera). */
export const PAYMENT_METHODS = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'NEQUI', 'DAVIPLATA', 'OTRO'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Abono a una cuenta por cobrar. */
@Entity({ name: 'receivable_payments', schema: 'manufacturing' })
@Index(['tenantId', 'receivableId'])
export class ReceivablePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'uuid' })
  receivableId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  /** Parte del abono imputada a intereses de mora (se imputa primero a intereses). */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  interestPortion: number;

  /** Parte del abono imputada a capital. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  capitalPortion: number;

  @Column({ type: 'varchar', length: 20 })
  method: PaymentMethod;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference: string | null;

  @Column({ type: 'date' })
  paymentDate: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  createdByUserId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  createdByEmail: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
