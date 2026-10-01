import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderPayment, PAYMENT_METHODS } from './entities/order-payment.entity';
import { balanceDue, computePaymentStatus } from './payment-plans';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { toManufactureOf } from '../common/order-stock';
import { MarketplaceConfigService } from '../marketplace-config/marketplace-config.service';
import { OrdersService } from './orders.service';
import { resolvePaymentOptions } from './payment-plans';

const round2 = (n: number) => Math.round(n * 100) / 100;
/** "$22.806": pesos enteros, como los muestra el frontend. */
const cop = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

/**
 * Los montos se muestran redondeados al peso: si el pago supera el saldo por
 * menos de $1 (p. ej. $22.806 sobre un saldo de $22.805,80) se toma el saldo.
 */
function fitToBalance(amount: number, balance: number): number {
  return amount > balance && amount - balance < 1 ? balance : amount;
}
const VOUCHER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VOUCHER_MAX_BYTES = 5 * 1024 * 1024;

export interface PaymentInput {
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
}

/**
 * Pagos de pedidos: comprobantes que sube el cliente desde el MarketPlace
 * (quedan por verificar) y pagos que registra el negocio (ya verificados).
 * orders.amountPaid / paymentStatus se recalculan SIEMPRE desde esta tabla.
 */
@Injectable()
export class OrderPaymentsService {
  constructor(
    @InjectRepository(OrderPayment) private readonly paymentRepository: Repository<OrderPayment>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cloudinaryService: CloudinaryService,
    private readonly marketplaceConfigService: MarketplaceConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  async listForOrder(tenantId: string, orderId: string) {
    return this.paymentRepository.find({ where: { tenantId, orderId }, order: { createdAt: 'DESC' } });
  }

  /** Pago registrado por el negocio (efectivo en tienda, transferencia ya confirmada…). */
  async registerByBusiness(tenantId: string, actorId: string, orderId: string, input: PaymentInput) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, { id: orderId, tenantId });
      const amount = this.validateInput(order, input);
      const payment = await manager.save(manager.create(OrderPayment, {
        tenantId,
        orderId,
        amount,
        method: input.method as any,
        reference: input.reference?.trim().slice(0, 100) || null,
        notes: input.notes?.trim().slice(0, 1000) || null,
        source: 'NEGOCIO',
        status: 'VERIFICADO',
        verifiedBy: actorId,
        verifiedAt: new Date(),
      }));
      const updated = await this.recalculate(manager, order);
      return { payment, order: updated };
    });
  }

  /** Comprobante subido por el comprador desde su enlace de seguimiento. */
  async submitByCustomer(trackingToken: string, input: PaymentInput, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Adjunta la foto del comprobante de pago.');
    if (!VOUCHER_TYPES.includes(file.mimetype) || file.size > VOUCHER_MAX_BYTES) {
      throw new BadRequestException('El comprobante debe ser una imagen JPG, PNG o WEBP de máximo 5 MB.');
    }

    const order = await this.findByToken(trackingToken);
    const amount = this.validateInput(order, input);
    // No se aceptan más comprobantes pendientes que el saldo
    const pending = await this.paymentRepository.find({ where: { orderId: order.id, status: 'PENDIENTE_VERIFICACION' } });
    const pendingTotal = pending.reduce((s, p) => s + Number(p.amount), 0);
    if (round2(amount + pendingTotal) > balanceDue(order) + 0.99) {
      throw new BadRequestException('Ya hay comprobantes por verificar que cubren el saldo del pedido.');
    }

    const uploaded = await this.cloudinaryService.uploadImageFromBuffer(file.buffer, 'inout/payment-vouchers');
    return this.paymentRepository.save(this.paymentRepository.create({
      tenantId: order.tenantId,
      orderId: order.id,
      amount,
      method: input.method as any,
      reference: input.reference?.trim().slice(0, 100) || null,
      voucherUrl: uploaded.secure_url,
      source: 'CLIENTE',
      status: 'PENDIENTE_VERIFICACION',
    }));
  }

  /** El negocio verifica o rechaza un comprobante del cliente. */
  async review(
    tenantId: string,
    actorId: string,
    orderId: string,
    paymentId: string,
    action: 'VERIFY' | 'REJECT',
    reason?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.lockOrder(manager, { id: orderId, tenantId });
      const payment = await manager.findOne(OrderPayment, { where: { id: paymentId, orderId, tenantId } });
      if (!payment) throw new NotFoundException('Pago no encontrado');
      if (payment.status !== 'PENDIENTE_VERIFICACION') {
        throw new BadRequestException('Este pago ya fue revisado.');
      }

      if (action === 'REJECT') {
        const rejectReason = (reason || '').trim();
        if (rejectReason.length < 5) throw new BadRequestException('Indica el motivo del rechazo (mínimo 5 caracteres).');
        payment.status = 'RECHAZADO';
        payment.rejectReason = rejectReason;
      } else {
        this.assertOrderAcceptsPayments(order);
        const fitted = fitToBalance(round2(Number(payment.amount)), balanceDue(order));
        if (fitted > balanceDue(order)) {
          throw new BadRequestException(`El pago supera el saldo pendiente (${cop(balanceDue(order))}).`);
        }
        payment.amount = fitted;
        payment.status = 'VERIFICADO';
      }
      payment.verifiedBy = actorId;
      payment.verifiedAt = new Date();
      await manager.save(payment);

      const updated = await this.recalculate(manager, order);
      return { payment, order: updated };
    });
  }

  /** Vista pública del pedido para su enlace de seguimiento (sin datos internos). */
  async track(trackingToken: string) {
    const order = await this.findByToken(trackingToken);
    const payments = await this.paymentRepository.find({ where: { orderId: order.id }, order: { createdAt: 'DESC' } });
    const config = await this.marketplaceConfigService.getConfig(order.tenantId);
    const delivery = await this.ordersService.estimateDelivery(order).catch(() => null);
    return {
      tenantId: order.tenantId,
      /** Entrega estimada (en vivo): franja programada o cálculo por etapa/cola. */
      estimatedDelivery: delivery,
      /** Hora del servidor, para mostrar "actualizado hace…". */
      serverTime: new Date(),
      storeSlug: config?.slug || null,
      orderCode: order.orderCode,
      status: order.status,
      createdAt: order.createdAt,
      customerName: (order.customerName || '').split(' | ')[0],
      items: (order.items || []).map((i: any) => ({
        productName: i.productName,
        quantity: i.quantity,
        subtotal: i.subtotal,
        toManufacture: toManufactureOf(i as any),
        // Solo lo necesario para mostrar el combo agrupado y la promoción
        ...(i.combo ? {
          combo: {
            groupId: i.combo.groupId,
            comboName: i.combo.comboName,
            comboQuantity: i.combo.comboQuantity,
            comboUnitPrice: i.combo.comboUnitPrice,
            ...(i.combo.promotion ? { promotion: { name: i.combo.promotion.name } } : {}),
          },
        } : {}),
        ...(i.promotion ? { promotion: { name: i.promotion.name } } : {}),
      })),
      total: Number(order.total),
      paymentPlan: order.paymentPlan,
      paymentStatus: order.paymentStatus,
      depositRequired: Number(order.depositRequired),
      amountPaid: Number(order.amountPaid),
      balanceDue: balanceDue(order),
      depositDeadline: order.depositDeadline,
      layawayDeadline: order.layawayDeadline,
      estimatedReadyAt: order.estimatedReadyAt,
      scheduledStart: order.scheduledStart,
      scheduledEnd: order.scheduledEnd,
      /** Datos de pago de la tienda (cuentas, Nequi…) para consignar. */
      paymentInstructions: resolvePaymentOptions(config?.paymentOptions).instructions,
      payments: payments.map((p) => ({
        amount: Number(p.amount),
        method: p.method,
        status: p.status,
        rejectReason: p.rejectReason,
        createdAt: p.createdAt,
      })),
    };
  }

  /** Suma lo VERIFICADO y actualiza amountPaid / paymentStatus del pedido. */
  async recalculate(manager: EntityManager, order: Order): Promise<Order> {
    const row = await manager
      .createQueryBuilder(OrderPayment, 'p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .where('p.orderId = :orderId AND p.status = :status', { orderId: order.id, status: 'VERIFICADO' })
      .getRawOne<{ total: string }>();
    order.amountPaid = round2(Number(row?.total) || 0);
    if (order.paymentPlan) {
      order.paymentStatus = computePaymentStatus({
        total: Number(order.total),
        depositRequired: Number(order.depositRequired),
        amountPaid: order.amountPaid,
      });
    }
    return manager.save(order);
  }

  private async findByToken(trackingToken: string): Promise<Order> {
    if (!trackingToken || trackingToken.length < 20) throw new NotFoundException('Pedido no encontrado');
    const order = await this.dataSource.getRepository(Order).findOne({ where: { trackingToken } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private async lockOrder(manager: EntityManager, where: { id: string; tenantId: string }): Promise<Order> {
    const order = await manager.findOne(Order, { where, lock: { mode: 'pessimistic_write' } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    return order;
  }

  private assertOrderAcceptsPayments(order: Order) {
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('El pedido está cancelado.');
    if (order.status === OrderStatus.INVOICED) throw new BadRequestException('El pedido ya fue facturado.');
    if (order.paymentPlan === 'CREDITO') {
      throw new BadRequestException('Este pedido es a crédito: los abonos se registran en Cartera.');
    }
  }

  private validateInput(order: Order, input: PaymentInput): number {
    this.assertOrderAcceptsPayments(order);
    const raw = round2(Number(input?.amount));
    if (!Number.isFinite(raw) || raw <= 0) throw new BadRequestException('El valor del pago debe ser mayor a cero.');
    if (!PAYMENT_METHODS.includes(input?.method as any)) throw new BadRequestException('Medio de pago no válido.');
    const amount = fitToBalance(raw, balanceDue(order));
    if (amount > balanceDue(order)) {
      throw new BadRequestException(`El pago supera el saldo pendiente (${cop(balanceDue(order))}).`);
    }
    return amount;
  }
}
