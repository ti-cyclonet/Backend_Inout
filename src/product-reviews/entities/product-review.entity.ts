import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Opinión de un cliente sobre un ítem de la tienda en línea (producto,
 * material de reventa o combo). Ver product-reviews-rules.ts.
 */
@Entity({ name: 'product_reviews', schema: 'manufacturing' })
@Index(['tenantId', 'itemId', 'status'])
@Index(['tenantId', 'status', 'createdAt'])
export class ProductReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  tenantId: string;

  @Column({ type: 'varchar', length: 100 })
  itemId: string;

  /** Nombre del ítem al opinar (el panel lo muestra aunque el ítem cambie o se borre). */
  @Column({ type: 'varchar', length: 255 })
  itemName: string;

  /** 1 a 5 */
  @Column({ type: 'smallint' })
  rating: number;

  @Column({ type: 'text' })
  comment: string;

  /** Nombre completo como lo escribió; la tienda muestra solo nombre e inicial. */
  @Column({ type: 'varchar', length: 60 })
  authorName: string;

  /** Opcional y privado: solo lo ve el negocio, para contactar al cliente. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  authorPhone: string | null;

  /** PENDING | PUBLISHED | HIDDEN */
  @Column({ type: 'varchar', length: 10, default: 'PENDING' })
  status: string;

  /** Respuesta pública del negocio. */
  @Column({ type: 'text', nullable: true })
  reply: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  repliedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** Hash de la IP (no la IP): limita cuántas opiniones envía un visitante. */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  visitorHash: string | null;

  /** Aceptación de publicar nombre y opinión (fecha, IP hash y navegador). */
  @Column({ type: 'jsonb', nullable: true })
  consents: Record<string, any> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
