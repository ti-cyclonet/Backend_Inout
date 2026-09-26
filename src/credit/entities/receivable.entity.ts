import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReceivableStatus {
  PENDIENTE = 'PENDIENTE',
  PARCIAL = 'PARCIAL',
  PAGADA = 'PAGADA',
  ANULADA = 'ANULADA',
}

/**
 * Cuenta por cobrar: una venta directa o un pedido facturado a crédito.
 * Vence según la condición de pago del cliente y se salda con abonos.
 */
@Entity({ name: 'receivables', schema: 'manufacturing' })
@Index(['tenantId', 'customerId'])
export class Receivable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  customerId: string;

  @Column({ type: 'varchar', length: 255 })
  customerName: string;

  /** 'SALE' | 'ORDER' */
  @Column({ type: 'varchar', length: 10 })
  sourceType: string;

  @Column({ type: 'varchar', length: 100 })
  sourceId: string;

  /** Código de la factura o del pedido. */
  @Column({ type: 'varchar', length: 50 })
  documentCode: string;

  @Column({ type: 'date' })
  issueDate: string;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({ type: 'int' })
  termDays: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  paidAmount: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  balance: number;

  @Column({ type: 'varchar', length: 12, default: ReceivableStatus.PENDIENTE })
  status: ReceivableStatus;

  @Column({ type: 'text', nullable: true })
  voidReason: string | null;

  // ── Intereses de mora ──
  /** Intereses causados y congelados hasta interestCalcDate. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  interestAccrued: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  interestPaid: number;

  /** Fecha hasta la que ya se causaron intereses (se actualiza con cada abono). */
  @Column({ type: 'date', nullable: true })
  interestCalcDate: string | null;

  // ── Recordatorios ──
  @Column({ type: 'timestamp', nullable: true })
  lastReminderAt: Date | null;

  @Column({ type: 'int', default: 0 })
  reminderCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
