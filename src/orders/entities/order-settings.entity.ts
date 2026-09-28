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

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
