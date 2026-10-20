import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn } from 'typeorm';

/** Configuración de pedidos por negocio: tiempos por etapa del kanban y capacidad de producción. */
@Entity({ name: 'order_settings', schema: 'manufacturing' })
export class OrderSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  tenantId: string;

  /** Minutos esperados por etapa: { CONFIRMED: 30, IN_PRODUCTION: 240, … }. Ausente = sin control. */
  @Column({ type: 'jsonb', default: () => `'{}'` })
  stageDurations: Record<string, number>;

  /** Pedidos que se preparan a la vez (para estimar la espera en la cola). */
  @Column({ type: 'int', default: 1 })
  productionCapacity: number;

  /** Turnos de producción: [{ name, days: [1..6], start: '08:00', end: '14:00', people: 2 }]. Vacío = sin turnos. */
  @Column({ type: 'jsonb', default: () => `'[]'` })
  shifts: any[];

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
