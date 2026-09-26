import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, Unique } from 'typeorm';

/**
 * Configuración de crédito y cartera por negocio (tenant): intereses de mora
 * y recordatorios automáticos de vencimiento.
 */
@Entity({ name: 'credit_settings', schema: 'manufacturing' })
@Unique(['tenantId'])
export class CreditSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  /**
   * Tasa de interés de mora mensual (%). 0 = no se cobran intereses. No
   * puede superar la tasa de usura vigente certificada por la
   * Superintendencia Financiera (responsabilidad del negocio configurarla).
   */
  @Column({ type: 'decimal', precision: 6, scale: 3, default: 0 })
  lateInterestMonthlyRate: number;

  /** Días de gracia después del vencimiento antes de causar intereses. */
  @Column({ type: 'int', default: 0 })
  graceDays: number;

  /** Enviar recordatorios automáticos por correo al cliente. */
  @Column({ type: 'boolean', default: false })
  remindersEnabled: boolean;

  /** Días antes del vencimiento para el recordatorio "próximo a vencer". */
  @Column({ type: 'int', default: 3 })
  reminderDaysBefore: number;

  /** Cada cuántos días se repite el recordatorio de una cuenta vencida. */
  @Column({ type: 'int', default: 7 })
  overdueReminderEveryDays: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
