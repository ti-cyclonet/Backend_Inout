import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Reserva de mesa (o cliente que llegó sin reserva). Ocupa una o varias mesas
 * (unidas) de startAt a endAt. Ver dining-rules.ts.
 */
@Entity({ name: 'table_reservations', schema: 'manufacturing' })
@Index(['tenantId', 'startAt'])
@Index(['tenantId', 'code'], { unique: true })
export class TableReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  /** RS-00001 */
  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'jsonb' })
  tableIds: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerId: string | null;

  @Column({ type: 'varchar', length: 120 })
  customerName: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  customerPhone: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  customerEmail: string | null;

  @Column({ type: 'int' })
  partySize: number;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz' })
  endAt: Date;

  /** PENDING | CONFIRMED | SEATED | COMPLETED | NO_SHOW | CANCELLED */
  @Column({ type: 'varchar', length: 15, default: 'CONFIRMED' })
  status: string;

  /** STAFF | WALK_IN | MARKETPLACE */
  @Column({ type: 'varchar', length: 15, default: 'STAFF' })
  source: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  /** Pedido anticipado (reservas de la tienda). */
  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  /** Anticipo pedido al reservar (pesos) y su estado. */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  depositAmount: number | null;

  @Column({ type: 'varchar', length: 15, nullable: true })
  depositStatus: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  seatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  cancelReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
