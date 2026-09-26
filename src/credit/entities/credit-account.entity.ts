import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';

/**
 * Estados del trámite de crédito vigente del cliente:
 * SOLICITADA → VALIDADA → CUPO_ASIGNADO → APROBADA | RECHAZADA.
 * (VALIDADA con resultado "no cumple" pasa directo a RECHAZADA.)
 */
export enum CreditRequestStatus {
  SOLICITADA = 'SOLICITADA',
  VALIDADA = 'VALIDADA',
  CUPO_ASIGNADO = 'CUPO_ASIGNADO',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
}

export interface CreditHistoryEntry {
  at: string;
  action: string;
  byUserId: string | null;
  byEmail: string | null;
  detail?: string;
}

/**
 * Cuenta de crédito de un cliente (usuario de Authoriza con rol clienteInout)
 * ante el negocio (tenant). Guarda el trámite en curso (solicitud →
 * validación → asignación → aprobación) y, aparte, las condiciones
 * APROBADAS vigentes: un ajuste de cupo en trámite no quita el cupo actual.
 */
@Entity({ name: 'credit_accounts', schema: 'manufacturing' })
@Unique(['tenantId', 'customerId'])
export class CreditAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  /** userId del cliente en Authoriza. */
  @Column({ type: 'varchar', length: 100 })
  customerId: string;

  @Column({ type: 'varchar', length: 255 })
  customerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail: string | null;

  // ── Trámite en curso ──────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: CreditRequestStatus.SOLICITADA })
  requestStatus: CreditRequestStatus;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  requestedAmount: number;

  @Column({ type: 'int', default: 30 })
  requestedTermDays: number;

  @Column({ type: 'text', nullable: true })
  requestNotes: string | null;

  /** Lista de chequeo + historial interno al momento de validar. */
  @Column({ type: 'jsonb', nullable: true })
  validation: {
    identityVerified: boolean;
    referencesVerified: boolean;
    paymentCapacityVerified: boolean;
    observations: string | null;
    internalHistory: { purchasesCount: number; purchasesTotal: number; outstanding: number; overdueCount: number };
  } | null;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  proposedLimit: number | null;

  @Column({ type: 'int', nullable: true })
  proposedTermDays: number | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  // ── Condiciones aprobadas vigentes ────────────────────────────────
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  approvedLimit: number;

  /** Condición de pago del cliente: plazo en días para sus ventas a crédito. */
  @Column({ type: 'int', default: 0 })
  approvedTermDays: number;

  @Column({ type: 'timestamp', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  suspended: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  history: CreditHistoryEntry[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
