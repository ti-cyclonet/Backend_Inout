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

  /** Ubicación exacta de entrega (GPS del comprador en el MarketPlace). */
  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  deliveryLatitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  deliveryLongitude: number;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.DRAFT })
  status: OrderStatus;

  @Column({ type: 'jsonb', nullable: true })
  /** itemType: 'product' (default si falta) | 'material' | 'material_t' (reventa, quantity en presentaciones).
   * reservedQuantity / toManufacture: fabricación bajo pedido (ver common/order-stock.ts);
   * sin esos campos la línea se considera totalmente reservada. */
  items: {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    itemType?: string;
    reservedQuantity?: number;
    toManufacture?: number;
  }[];

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'date', nullable: true })
  deliveryDate: Date;

  /** Motivo obligatorio que el usuario escribe al cancelar el pedido. */
  @Column({ type: 'text', nullable: true })
  cancellationReason: string;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  /** Forma de pago que pidió el cliente en el MarketPlace ('CREDITO' si compró a crédito). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  requestedPaymentType: string | null;

  /** Forma de pago al facturar: 'CONTADO' | 'CREDITO' (null mientras no se factura). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  paymentType: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null;

  @Column({ type: 'timestamp', nullable: true })
  invoicedAt: Date | null;

  // ─── Formas de pago del MarketPlace (ver orders/payment-plans.ts) ───

  /** CONTADO | CONTRA_ENTREGA | MITAD_MITAD | PLAN_SEPARE | CREDITO. Null = pedido anterior o del panel. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentPlan: string | null;

  /** Monto que debe estar verificado antes de fabricar o despachar. */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  depositRequired: number;

  /** Suma de pagos VERIFICADOS (se recalcula desde order_payments; no se edita a mano). */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amountPaid: number;

  /** SIN_PAGO | ANTICIPO_PENDIENTE | ANTICIPO_CUBIERTO | PARCIAL | PAGADO */
  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentStatus: string | null;

  /** Si el anticipo no está verificado a esta hora, el pedido se cancela y libera stock. */
  @Column({ type: 'timestamptz', nullable: true })
  depositDeadline: Date | null;

  /** Plan separe: fecha límite para completar el pago (YYYY-MM-DD). */
  @Column({ type: 'date', nullable: true })
  layawayDeadline: string | null;

  /** Estimado de cuándo estará listo (hay unidades por fabricar). */
  @Column({ type: 'timestamptz', nullable: true })
  estimatedReadyAt: Date | null;

  /** Token del enlace de seguimiento: el comprador (aun invitado) ve su pedido y sube comprobantes. */
  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  trackingToken: string | null;

  /** Se canceló con pagos verificados: el negocio debe decidir la devolución. */
  @Column({ type: 'boolean', default: false })
  refundPending: boolean;

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
