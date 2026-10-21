import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum FeaturedStatus {
  /** Factura emitida: el cupo queda reservado mientras se paga. */
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  /** Pagado: la tienda sale destacada entre startsAt y endsAt. */
  ACTIVE = 'ACTIVE',
  /** Terminó su periodo. */
  EXPIRED = 'EXPIRED',
  /** No se pagó a tiempo o se canceló: el cupo se liberó. */
  CANCELLED = 'CANCELLED',
}

/** Una compra de "Destacado en CycloNet Market" (ver featured.ts). */
@Entity({ name: 'market_featured', schema: 'manufacturing' })
@Index(['status', 'endsAt'])
export class MarketFeatured {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  @Index()
  tenantId: string;

  /** WEEK (7 días) o MONTH (30 días). */
  @Column({ type: 'varchar', length: 10 })
  plan: 'WEEK' | 'MONTH';

  @Column({ type: 'int' })
  days: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 20, default: FeaturedStatus.PENDING_PAYMENT })
  status: FeaturedStatus;

  /** Periodo reservado (se corre si se paga después de startsAt). */
  @Column({ type: 'timestamptz' })
  startsAt: Date;

  @Column({ type: 'timestamptz' })
  endsAt: Date;

  /** Factura en Authoriza (se paga en FactoNet). */
  @Column({ type: 'varchar', length: 40, nullable: true })
  invoiceId: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  invoiceCode: string | null;

  /** Último estado de la factura visto en Authoriza. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  invoiceStatus: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
