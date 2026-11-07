import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Mesa del local: dónde está en el plano (posición en %), su zona y sus puestos. */
@Entity({ name: 'dining_tables', schema: 'manufacturing' })
@Index(['tenantId', 'active'])
export class DiningTable {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  /** "Mesa 4", "Barra 1"… */
  @Column({ type: 'varchar', length: 30 })
  name: string;

  /** "Salón", "Terraza"… */
  @Column({ type: 'varchar', length: 40, default: 'Salón' })
  zone: string;

  @Column({ type: 'int', default: 4 })
  seats: number;

  /** square | round | rect */
  @Column({ type: 'varchar', length: 10, default: 'square' })
  shape: string;

  /** Posición en el plano de su zona, en % del ancho y del alto. */
  @Column({ type: 'float', default: 10 })
  posX: number;

  @Column({ type: 'float', default: 10 })
  posY: number;

  /** Se puede unir con otra para grupos grandes. */
  @Column({ type: 'boolean', default: false })
  joinable: boolean;

  /** Las mesas no se borran (tienen reservas): se desactivan. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
