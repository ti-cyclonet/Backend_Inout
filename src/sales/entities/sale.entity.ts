import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity({ name: 'sales', schema: 'manufacturing' })
@Unique(['strInvoiceCode', 'strTenantId'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  strId: string;

  @Column({ type: 'varchar', length: 100 })
  strTenantId: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  strInvoiceCode: string;

  @Column({ type: 'varchar', length: 100 })
  strProductId: string;

  @Column({ type: 'date' })
  dtmDate: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltQuantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fltUnitPrice: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName: string;

  @Column({ type: 'varchar', nullable: true })
  strCustomerId: string;

  @Column({ type: 'jsonb', nullable: true })
  items: any;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  tax: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, default: 0 })
  discount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  total: number;

  /** 'CONTADO' | 'CREDITO'. A crédito se genera una cuenta por cobrar. */
  @Column({ type: 'varchar', length: 10, default: 'CONTADO' })
  paymentType: string;

  /** Medio de pago de contado (EFECTIVO, TRANSFERENCIA, TARJETA, NEQUI, DAVIPLATA, OTRO). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  paymentMethod: string | null;

  /** Pago de contado dividido en varios medios (paymentMethod = 'MIXTO'); null si fue uno solo. */
  @Column({ type: 'jsonb', nullable: true })
  payments: { method: string; amount: number }[] | null;

  /** Foto del volante del datáfono o del comprobante de la transferencia (opcional). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  strPaymentProofUrl: string | null;

  /** N° de aprobación o referencia del pago (opcional). */
  @Column({ type: 'varchar', length: 100, nullable: true })
  strPaymentReference: string | null;

  /** Ganancia al facturar: ingreso sin impuestos ni domicilio − costo de lo vendido (common/sale-profit.ts). */
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  profit: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  dtmCreationDate: Date;

  /**
   * Anulada (error de registro): el stock volvió al inventario y la venta deja
   * de contar en paneles, cartera y estadísticas. Se conserva para no dejar
   * huecos en la numeración de facturas.
   */
  @Column({ type: 'timestamp', nullable: true })
  dtmVoidedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  strVoidReason: string | null;

  /** Correo de quien la anuló. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  strVoidedBy: string | null;
}
