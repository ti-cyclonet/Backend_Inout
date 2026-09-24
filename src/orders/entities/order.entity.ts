import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum OrderStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  IN_PRODUCTION = 'IN_PRODUCTION',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  INVOICED = 'INVOICED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'orders', schema: 'manufacturing' })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  tenantId: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  orderCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customerId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  // Contacto del comprador del MarketPlace (antes solo quedaba dentro de
  // customerName para invitados y se perdía en pedidos con sesión iniciada).
  @Column({ type: 'varchar', length: 50, nullable: true })
  customerPhone: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  customerAddress: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: 'jsonb', nullable: true })
  /** itemType: 'product' (default si falta) | 'material' | 'material_t' (reventa, quantity en presentaciones). */
  items: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number; itemType?: string }[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'date', nullable: true })
  deliveryDate: Date;

  /** Motivo obligatorio que el usuario escribe al cancelar el pedido. */
  @Column({ type: 'text', nullable: true })
  cancellationReason: string;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  /** Prueba de la aceptación de Términos y Tratamiento de Datos del comprador (MarketPlace). */
  @Column({ type: 'jsonb', nullable: true })
  consents: {
    termsVersion: string;
    habeasDataVersion: string;
    acceptedAt: string;
    ipAddress: string | null;
    userAgent: string | null;
  } | null;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  tax: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  total: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
