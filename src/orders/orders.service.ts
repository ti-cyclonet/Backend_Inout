import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Between, In, Not } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CreateOrderDto, OrderSlotsQueryDto } from './dto/create-order.dto';
import { CreateMarketplaceOrderDto, MarketplaceSlotsQueryDto } from './dto/create-marketplace-order.dto';
import { CreditService } from '../credit/credit.service';
import { applyStockDelta, movementTarget, resolveStockLines } from '../common/stock-availability';
import { previewOrderStock, reservedLines, reserveManufactured, reserveOrderStock, toManufactureOf } from '../common/order-stock';
import { expandComboLines } from '../combos/combo-lines';
import { PricingService } from '../promotions/pricing.service';
import { assertSlotAvailable, bogotaDate, bogotaToUtc, buildSlots, resolveScheduling } from './scheduling';
import { MarketplaceConfigService } from '../marketplace-config/marketplace-config.service';
import {
  balanceDue,
  computePaymentStatus,
  computePlanTerms,
  isDepositCovered,
  PaymentPlan,
  PLANS_WITH_DEPOSIT,
  resolvePaymentOptions,
} from './payment-plans';
import { randomBytes } from 'crypto';
import { OrderSettings } from './entities/order-settings.entity';
import {
  estimateQueue,
  OrderTimingSettings,
  QueueOrder,
  resolveTimingSettings,
  stageDueAt,
} from './order-timing';

/** Origen (IP / navegador) de la aceptación de términos en el MarketPlace. */
export interface ConsentMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(InventoryMovement)
    private inventoryMovementRepository: Repository<InventoryMovement>,
    @InjectRepository(OrderSettings)
    private orderSettingsRepository: Repository<OrderSettings>,
    private dataSource: DataSource,
    private creditService: CreditService,
    private marketplaceConfigService: MarketplaceConfigService,
    private pricingService: PricingService,
  ) {}

  /**
   * MarketPlace: el SERVIDOR pone el precio de cada línea (precio normal y
   * mejor promoción vigente), el subtotal y el total. Antes se tomaban los
   * del navegador, que el comprador podía alterar.
   */
  private async priceMarketplaceOrder(createDto: CreateMarketplaceOrderDto): Promise<void> {
    const priced = await this.pricingService.priceLines(createDto.tenantId, createDto.items, 'MARKETPLACE', 'ENFORCE');
    createDto.items = priced.items;
    createDto.subtotal = priced.subtotal;
    createDto.tax = 0;
    createDto.total = priced.subtotal;
  }

  // ─── Tiempos por etapa y cola ───

  async getTimingSettings(tenantId: string): Promise<OrderTimingSettings> {
    const saved = await this.orderSettingsRepository.findOne({ where: { tenantId } });
    return resolveTimingSettings(saved as any);
  }

  async updateTimingSettings(tenantId: string, body: Partial<OrderTimingSettings>): Promise<OrderTimingSettings> {
    const settings = resolveTimingSettings(body);
    const existing = await this.orderSettingsRepository.findOne({ where: { tenantId } });
    await this.orderSettingsRepository.save({
      ...(existing || {}),
      tenantId,
      stageDurations: settings.stageDurations as Record<string, number>,
      productionCapacity: settings.productionCapacity,
    });
    return settings;
  }

  /** Registra la entrada del pedido a una etapa: hora, vencimiento e historial. */
  private enterStage(order: Order, status: OrderStatus, settings: OrderTimingSettings, now = new Date()) {
    const history = [...(order.statusHistory || [])];
    const last = history[history.length - 1];
    if (last && !last.leftAt) last.leftAt = now.toISOString();
    const due = stageDueAt(settings, status, now, Number(order.productionLeadHours) || 0);
    history.push({
      status,
      enteredAt: now.toISOString(),
      expectedMinutes: due ? Math.round((due.getTime() - now.getTime()) / 60000) : null,
    });
    order.statusHistory = history;
    order.stageEnteredAt = now;
    order.stageDueAt = due;
  }

  private toQueueOrder(o: Order): QueueOrder {
    return {
      id: o.id,
      status: o.status,
      stageEnteredAt: o.stageEnteredAt || null,
      createdAt: o.createdAt,
      leadHours: Number(o.productionLeadHours) || 0,
      scheduledStart: o.scheduledStart ? new Date(o.scheduledStart) : null,
    };
  }

  // ─── Pedidos programados ───

  /** Pedidos ya programados en un día, por inicio de franja (para el cupo). */
  private async takenSlots(tenantId: string, date: string, excludeOrderId?: string): Promise<Map<number, number>> {
    const rows = await this.orderRepository.find({
      where: {
        tenantId,
        status: Not(OrderStatus.CANCELLED),
        scheduledStart: Between(bogotaToUtc(date, 0), bogotaToUtc(date, 24 * 60)),
      },
      select: ['id', 'scheduledStart'],
    });
    const taken = new Map<number, number>();
    for (const r of rows) {
      if (r.id === excludeOrderId) continue;
      const k = new Date(r.scheduledStart!).getTime();
      taken.set(k, (taken.get(k) || 0) + 1);
    }
    return taken;
  }

  /**
   * Franjas de un día para lo que hay en el carrito: considera la cola de
   * producción y el tiempo de fabricación de lo que falte en stock.
   */
  async getMarketplaceSlots(query: MarketplaceSlotsQueryDto) {
    return this.getSlots(query.tenantId, query.date, query.items || []);
  }

  /** Franjas para un pedido del panel (la tienda sale del token). */
  async getPanelSlots(tenantId: string, query: OrderSlotsQueryDto) {
    return this.getSlots(tenantId, query.date, query.items || []);
  }

  private async getSlots(tenantId: string, date: string, items: any[]) {
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    const scheduling = resolveScheduling(config?.scheduling);
    if (!scheduling.enabled) return { enabled: false, date, earliestReadyAt: null, slotMinutes: scheduling.slotMinutes, slots: [] };

    const expanded = await expandComboLines(this.dataSource.manager, tenantId, items);
    const preview = await previewOrderStock(this.dataSource.manager, tenantId, expanded);
    const timing = await this.getTimingSettings(tenantId);
    const earliestReadyAt = await this.estimateReadyForNewOrder(tenantId, preview.maxLeadHours, timing);
    const slots = buildSlots(date, scheduling, {
      now: new Date(),
      earliestReadyAt,
      takenBySlotStart: await this.takenSlots(tenantId, date),
    });
    return { enabled: true, date, earliestReadyAt, slotMinutes: scheduling.slotMinutes, slots };
  }

  /**
   * Franja de un pedido del panel. Con la programación de la tienda activa se
   * valida igual que en el MarketPlace, salvo `override`: el negocio puede
   * acordar con el cliente una franja llena o fuera de los tiempos. Sin
   * programación activa se acepta la hora dada con una franja de 60 min.
   */
  private async resolvePanelSchedule(
    tenantId: string,
    scheduledStart: string,
    items: any[],
    override: boolean,
    excludeOrderId?: string,
  ): Promise<{ start: Date; end: Date }> {
    const at = new Date(scheduledStart);
    if (isNaN(at.getTime())) throw new BadRequestException('Fecha y hora de entrega no válidas.');
    const scheduling = resolveScheduling((await this.marketplaceConfigService.getConfig(tenantId))?.scheduling);
    const minutes = scheduling.enabled ? scheduling.slotMinutes : 60;
    if (!scheduling.enabled || override) {
      return { start: at, end: new Date(at.getTime() + minutes * 60000) };
    }

    const preview = await previewOrderStock(this.dataSource.manager, tenantId, items);
    const earliestReadyAt = await this.estimateReadyForNewOrder(tenantId, preview.maxLeadHours, await this.getTimingSettings(tenantId));
    const taken = await this.takenSlots(tenantId, bogotaDate(at), excludeOrderId);
    return assertSlotAvailable(at, scheduling, { now: new Date(), earliestReadyAt, takenBySlotStart: taken });
  }

  /** Agenda del panel: pedidos programados entre dos fechas (YYYY-MM-DD, hora de Colombia). */
  async getAgenda(tenantId: string, from?: string, to?: string) {
    const valid = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null);
    const start = valid(from) || bogotaDate(new Date());
    const end = valid(to) || start;
    const orders = await this.orderRepository.find({
      where: {
        tenantId,
        status: Not(In([OrderStatus.CANCELLED])),
        scheduledStart: Between(bogotaToUtc(start, 0), bogotaToUtc(end, 24 * 60)),
      },
      order: { scheduledStart: 'ASC' },
    });
    return { from: start, to: end, data: orders };
  }

  /**
   * Estado del kanban: vencimiento de la etapa de cada pedido activo y, para
   * la cola de producción, posición, espera e inicio/fin estimados.
   */
  async getQueue(tenantId: string) {
    const settings = await this.getTimingSettings(tenantId);
    const active = await this.orderRepository.find({
      where: [
        { tenantId, status: OrderStatus.DRAFT },
        { tenantId, status: OrderStatus.CONFIRMED },
        { tenantId, status: OrderStatus.IN_PRODUCTION },
        { tenantId, status: OrderStatus.READY },
        { tenantId, status: OrderStatus.OUT_FOR_DELIVERY },
        { tenantId, status: OrderStatus.DELIVERED },
      ],
    });
    const now = new Date();
    const estimates = new Map(estimateQueue(active.map((o) => this.toQueueOrder(o)), settings, now).map((e) => [e.id, e]));
    // Comprobantes de clientes por verificar, para marcarlos en las tarjetas
    const pendingRows: { orderId: string; total: string }[] = await this.dataSource.query(
      `SELECT "orderId", COUNT(*) AS total FROM manufacturing.order_payments
        WHERE "tenantId" = $1 AND status = 'PENDIENTE_VERIFICACION' GROUP BY "orderId"`,
      [tenantId],
    );
    const pendingVouchers = new Map(pendingRows.map((r) => [r.orderId, Number(r.total)]));
    return {
      settings,
      orders: active.map((o) => {
        const due = o.stageDueAt ? new Date(o.stageDueAt) : null;
        const est = estimates.get(o.id);
        return {
          orderId: o.id,
          status: o.status,
          stageEnteredAt: o.stageEnteredAt,
          stageDueAt: due,
          // Positivo = atrasado; negativo = minutos que le quedan
          overdueMinutes: due ? Math.round((now.getTime() - due.getTime()) / 60000) : null,
          scheduledStart: o.scheduledStart,
          scheduledEnd: o.scheduledEnd,
          pendingVouchers: pendingVouchers.get(o.id) || 0,
          queuePosition: est?.queuePosition ?? null,
          waitMinutes: est?.waitMinutes ?? null,
          estimatedStartAt: est?.estimatedStartAt ?? null,
          estimatedReadyAt: est?.estimatedReadyAt ?? null,
        };
      }),
    };
  }

  /**
   * Entrega estimada de un pedido para su seguimiento público. Programado: su
   * franja. Si no, según la etapa: la cola de producción (espera + fabricación)
   * y luego los tiempos de Listo y En reparto. Null si no hay con qué estimar.
   */
  async estimateDelivery(order: Order): Promise<{ at: Date; end: Date | null; scheduled: boolean; late?: boolean } | null> {
    if (order.scheduledStart && ![OrderStatus.DELIVERED, OrderStatus.INVOICED, OrderStatus.CANCELLED].includes(order.status)) {
      const start = new Date(order.scheduledStart);
      const end = order.scheduledEnd ? new Date(order.scheduledEnd) : null;
      // Franja ya vencida y el pedido sin entregar: se avisa el retraso en vez
      // de mostrarla como si aún estuviera por llegar
      const late = (end || start).getTime() < Date.now();
      return { at: start, end, scheduled: true, ...(late ? { late: true } : {}) };
    }
    const settings = await this.getTimingSettings(order.tenantId);
    const minutes = (s: OrderStatus) => settings.stageDurations[s as keyof typeof settings.stageDurations] || 0;
    const now = new Date();
    const later = (d: Date | null) => (d && d.getTime() > now.getTime() ? d : now);
    const plus = (d: Date, m: number) => new Date(d.getTime() + m * 60000);

    let at: Date | null = null;
    if (order.status === OrderStatus.CONFIRMED || order.status === OrderStatus.IN_PRODUCTION) {
      const queued = await this.orderRepository.find({
        where: [
          { tenantId: order.tenantId, status: OrderStatus.CONFIRMED },
          { tenantId: order.tenantId, status: OrderStatus.IN_PRODUCTION },
        ],
      });
      const est = estimateQueue(queued.map((o) => this.toQueueOrder(o)), settings, now).find((e) => e.id === order.id);
      if (est) at = plus(est.estimatedReadyAt, minutes(OrderStatus.READY) + minutes(OrderStatus.OUT_FOR_DELIVERY));
    } else if (order.status === OrderStatus.READY) {
      at = plus(later(order.stageDueAt ? new Date(order.stageDueAt) : null), minutes(OrderStatus.OUT_FOR_DELIVERY));
    } else if (order.status === OrderStatus.OUT_FOR_DELIVERY) {
      at = order.stageDueAt ? later(new Date(order.stageDueAt)) : null;
    }
    // Sin tiempos configurados el cálculo daría "ahora": mejor no mostrar nada
    if (!at || at.getTime() <= now.getTime()) return null;
    return { at, end: null, scheduled: false };
  }

  /** Hora estimada de listo para un pedido que entra al final de la cola ahora. */
  private async estimateReadyForNewOrder(tenantId: string, leadHours: number, settings: OrderTimingSettings): Promise<Date | null> {
    const queued = await this.orderRepository.find({
      where: [
        { tenantId, status: OrderStatus.CONFIRMED },
        { tenantId, status: OrderStatus.IN_PRODUCTION },
      ],
    });
    const now = new Date();
    const probe: QueueOrder = { id: '__new__', status: OrderStatus.CONFIRMED, stageEnteredAt: now, createdAt: now, leadHours };
    const est = estimateQueue([...queued.map((o) => this.toQueueOrder(o)), probe], settings, now).find((e) => e.id === '__new__');
    // Sin tiempos configurados ni fabricación, no hay estimado que dar
    return est && est.estimatedReadyAt.getTime() > now.getTime() ? est.estimatedReadyAt : null;
  }

  /** Plan de pago pedido: paymentPlan (nuevo) o paymentPreference (checkout anterior). */
  private requestedPlan(createDto: CreateMarketplaceOrderDto): PaymentPlan | null {
    if (createDto.paymentPlan) return createDto.paymentPlan as PaymentPlan;
    return createDto.paymentPreference === 'CREDITO' ? 'CREDITO' : null;
  }

  private async getContractPrefix(tenantId: string): Promise<string> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);

      if (response.ok) {
        const contract = await response.json();
        return contract.codePrefix || 'ABC';
      }
    } catch (error) {
      console.error('Error obteniendo prefijo del contrato:', error);
    }

    return 'ABC';
  }

  private async generateOrderCode(tenantId: string): Promise<string> {
    const prefix = await this.getContractPrefix(tenantId);

    const lastOrder = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.tenantId = :tenantId', { tenantId })
      .andWhere('order.orderCode IS NOT NULL')
      .andWhere('order.orderCode LIKE :pattern', { pattern: `${prefix}-PD-%` })
      .orderBy('order.orderCode', 'DESC')
      .getOne();

    let nextNumber = 1;
    if (lastOrder?.orderCode) {
      const parts = lastOrder.orderCode.split('-');
      const lastNumber = parseInt(parts[parts.length - 1]);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }

    return `${prefix}-PD-${nextNumber.toString().padStart(5, '0')}`;
  }

  async create(createDto: CreateOrderDto, tenantId: string) {
    // Precio normal + promoción vigente (se respeta el precio que el usuario
    // haya escrito) y combos virtuales -> sus componentes
    createDto.items = (await this.pricingService.priceLines(tenantId, createDto.items, 'POS', 'SUGGEST')).items;
    createDto.items = await expandComboLines(this.dataSource.manager, tenantId, createDto.items);
    const slot = createDto.scheduledStart
      ? await this.resolvePanelSchedule(tenantId, createDto.scheduledStart, createDto.items || [], !!createDto.allowSlotOverride)
      : null;
    const orderCode = await this.generateOrderCode(tenantId);

    const order = this.orderRepository.create({
      tenantId,
      orderCode,
      status: OrderStatus.DRAFT,
      customerId: createDto.customerId || null,
      customerName: createDto.customerName || null,
      items: createDto.items || null,
      notes: createDto.notes || null,
      // Programado: el día de entrega sale de la franja (lo usan cotización y remisión)
      deliveryDate: slot ? new Date(`${bogotaDate(slot.start)}T12:00:00-05:00`)
        : createDto.deliveryDate ? new Date(createDto.deliveryDate) : null,
      scheduledStart: slot?.start || null,
      scheduledEnd: slot?.end || null,
      // Enlace de seguimiento para compartir con el cliente
      trackingToken: randomBytes(24).toString('hex'),
      subtotal: createDto.subtotal || 0,
      tax: createDto.tax || 0,
      discount: createDto.discount || 0,
      total: createDto.total || 0,
    });
    this.enterStage(order, OrderStatus.DRAFT, await this.getTimingSettings(tenantId));

    const savedOrder = await this.orderRepository.save(order);
    return { message: 'Pedido creado exitosamente', order: savedOrder };
  }

  /** Checkout anónimo (sin sesión): sigue funcionando igual que antes — no es
   * obligatorio iniciar sesión para comprar. Si el comprador dio su correo,
   * además queda registrado en Authoriza como cliente potencial (best-effort,
   * no bloquea el pedido si esa llamada falla). */
  async createFromMarketplace(createDto: CreateMarketplaceOrderDto, meta: ConsentMeta = {}) {
    await this.priceMarketplaceOrder(createDto);
    const savedOrder = await this.saveMarketplaceOrder(createDto, {
      customerId: null,
      customerName: `${createDto.customerName} | ${createDto.customerPhone}${createDto.customerAddress ? ' | ' + createDto.customerAddress : ''}`,
    }, meta);

    // Todo invitado queda como CLIENTE POTENCIAL en Authoriza (potential_users),
    // con o sin correo, para poder invitarlo luego a usar la aplicación.
    this.registerPotentialCustomer(createDto).catch((err) =>
      console.error('No se pudo registrar el cliente potencial en Authoriza:', err?.message),
    );

    const whatsapp = await this.getMarketplaceWhatsapp(createDto.tenantId);
    return {
      message: 'Pedido creado exitosamente desde marketplace',
      order: savedOrder,
      ...(whatsapp && { whatsapp }),
    };
  }

  /** Checkout de un clienteInout autenticado: el pedido queda vinculado a su
   * userId real de Authoriza en vez de solo un texto libre. */
  async createFromMarketplaceAuthenticated(createDto: CreateMarketplaceOrderDto, authUserId: string, meta: ConsentMeta = {}) {
    // Primero el precio del servidor: el cupo de crédito se valida con él
    await this.priceMarketplaceOrder(createDto);
    // Compra a crédito: el cliente debe tener cupo disponible y estar al día.
    // La cuenta por cobrar se crea al facturar el pedido.
    if (this.requestedPlan(createDto) === 'CREDITO') {
      await this.creditService.assertCanRequestCreditPurchase(createDto.tenantId, authUserId, Number(createDto.total) || 0);
    }
    const savedOrder = await this.saveMarketplaceOrder(createDto, {
      customerId: authUserId,
      customerName: createDto.customerName,
    }, meta);

    const whatsapp = await this.getMarketplaceWhatsapp(createDto.tenantId);
    return {
      message: 'Pedido creado exitosamente desde marketplace',
      order: savedOrder,
      ...(whatsapp && { whatsapp }),
    };
  }

  /** Los pedidos del marketplace nacen ya CONFIRMED (sin pasar por DRAFT), así
   * que la reserva de stock que normalmente ocurre en updateStatus() al pasar
   * a CONFIRMED debe hacerse aquí mismo, dentro de una transacción, para que
   * quede reflejada de inmediato y no se pueda sobrevender. */
  private async saveMarketplaceOrder(
    createDto: CreateMarketplaceOrderDto,
    customer: { customerId: string | null; customerName: string },
    meta: ConsentMeta,
  ) {
    const { tenantId } = createDto;

    // Invitado: la aceptación va con el pedido. Cliente con sesión
    // (customerId): ya la dio al registrarse/iniciar sesión (Authoriza).
    const isGuest = !customer.customerId;
    const accepted = createDto.acceptTerms === true && createDto.acceptHabeasData === true
      && !!createDto.termsVersion && !!createDto.habeasDataVersion;
    if (isGuest && !accepted) {
      throw new BadRequestException(
        'Debes aceptar los Términos y Condiciones y autorizar el tratamiento de tus datos personales para hacer el pedido.',
      );
    }
    const consents = accepted
      ? {
          termsVersion: createDto.termsVersion!,
          habeasDataVersion: createDto.habeasDataVersion!,
          acceptedAt: new Date().toISOString(),
          ipAddress: meta.ipAddress?.slice(0, 64) || null,
          userAgent: meta.userAgent?.slice(0, 500) || null,
        }
      : null;
    const hasLocation = Number.isFinite(createDto.deliveryLatitude) && Number.isFinite(createDto.deliveryLongitude);
    const plan = this.requestedPlan(createDto);
    const options = plan ? resolvePaymentOptions((await this.marketplaceConfigService.getConfig(tenantId))?.paymentOptions) : null;
    const timing = await this.getTimingSettings(tenantId);
    const marketplaceConfig = createDto.scheduledStart ? await this.marketplaceConfigService.getConfig(tenantId) : null;

    return this.dataSource.transaction(async (manager) => {
      // Combos virtuales -> sus componentes (precio del combo prorrateado)
      createDto.items = await expandComboLines(manager, tenantId, createDto.items);
      // Reserva lo disponible; lo que falte de productos "bajo pedido" queda por fabricar
      const stock = await reserveOrderStock(manager, tenantId, createDto.items);

      // Condiciones del plan (montos y plazos calculados aquí, nunca del cliente)
      const terms = plan
        ? computePlanTerms(plan, options!, {
            total: Number(createDto.total) || 0,
            hasAccount: !!customer.customerId,
            hasMadeToOrder: stock.hasMadeToOrder,
          })
        : null;

      // Hora estimada de listo (cola + fabricación) y, si se programó, validar la franja
      const earliestReadyAt = await this.estimateReadyForNewOrder(tenantId, stock.maxLeadHours, timing);
      const slot = createDto.scheduledStart
        ? assertSlotAvailable(createDto.scheduledStart, resolveScheduling(marketplaceConfig?.scheduling), {
            now: new Date(),
            earliestReadyAt,
            takenBySlotStart: await this.takenSlots(tenantId, bogotaDate(new Date(createDto.scheduledStart))),
          })
        : null;

      const orderCode = await this.generateOrderCode(tenantId);
      const order = manager.create(Order, {
        tenantId,
        orderCode,
        status: OrderStatus.CONFIRMED,
        customerId: customer.customerId,
        customerName: customer.customerName,
        customerPhone: createDto.customerPhone?.trim() || null,
        customerEmail: createDto.customerEmail?.trim() || null,
        customerAddress: createDto.customerAddress?.trim() || null,
        requestedPaymentType: customer.customerId && plan === 'CREDITO' ? 'CREDITO' : null,
        paymentPlan: plan,
        depositRequired: terms?.depositRequired || 0,
        amountPaid: 0,
        paymentStatus: plan
          ? computePaymentStatus({ total: Number(createDto.total) || 0, depositRequired: terms?.depositRequired || 0, amountPaid: 0 })
          : null,
        depositDeadline: terms?.depositDeadline || null,
        layawayDeadline: terms?.layawayDeadline || null,
        productionLeadHours: stock.maxLeadHours || null,
        // Incluye la espera por los pedidos que ya están en la cola
        estimatedReadyAt: earliestReadyAt,
        scheduledStart: slot?.start || null,
        scheduledEnd: slot?.end || null,
        trackingToken: randomBytes(24).toString('hex'),
        deliveryLatitude: hasLocation ? createDto.deliveryLatitude : null,
        deliveryLongitude: hasLocation ? createDto.deliveryLongitude : null,
        items: stock.items,
        notes: createDto.notes || null,
        subtotal: createDto.subtotal || 0,
        tax: createDto.tax || 0,
        discount: 0,
        total: createDto.total || 0,
        consents,
      });
      this.enterStage(order, OrderStatus.CONFIRMED, timing);
      return manager.save(order);
    });
  }

  private async getMarketplaceWhatsapp(tenantId: string): Promise<string | null> {
    try {
      const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
      const response = await fetch(`${authorizaUrl}/api/contracts/tenant/${tenantId}`);
      if (response.ok) {
        const contract = await response.json();
        if (contract.marketplaceConfig?.whatsapp) {
          return contract.marketplaceConfig.whatsapp;
        }
      }
    } catch (error) {
      console.error('Error obteniendo config de marketplace:', error);
    }
    return null;
  }

  /** Best-effort: registra/actualiza al comprador de invitado como cliente
   * potencial en Authoriza (pendiente de registro), scoped al tenant de esta
   * tienda. No lanza si falla — el pedido ya se guardó igual. */
  private async registerPotentialCustomer(createDto: CreateMarketplaceOrderDto): Promise<void> {
    const authorizaUrl = process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000';
    const res = await fetch(`${authorizaUrl}/api/potential-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createDto.customerEmail?.trim() || undefined,
        name: createDto.customerName,
        phone: createDto.customerPhone,
        address: createDto.customerAddress?.trim() || undefined,
        sourceApplication: 'Inout',
        sourceTenantId: createDto.tenantId,
      }),
    });
    if (!res.ok) throw new Error(`Authoriza respondió ${res.status}`);
  }

  /** Últimos datos de contacto/entrega que usó un cliente con sesión en esta
   * tienda, para precargar su siguiente pedido. */
  async findLastMarketplaceContact(tenantId: string, customerId: string) {
    const last = await this.orderRepository.findOne({
      where: { tenantId, customerId },
      order: { createdAt: 'DESC' },
    });
    if (!last) return null;
    return {
      customerName: last.customerName || null,
      customerPhone: last.customerPhone || null,
      customerAddress: last.customerAddress || null,
    };
  }

  /**
   * Unidades por fabricar de los pedidos activos, agrupadas por producto, para
   * planear los lotes de producción.
   */
  async findToManufacture(tenantId: string) {
    const orders = await this.orderRepository.find({
      where: [
        { tenantId, status: OrderStatus.CONFIRMED },
        { tenantId, status: OrderStatus.IN_PRODUCTION },
      ],
      order: { createdAt: 'ASC' },
    });

    const byProduct = new Map<string, { productId: string; productName: string; quantity: number; orders: any[] }>();
    for (const order of orders) {
      for (const item of order.items || []) {
        const qty = toManufactureOf(item as any);
        if (qty <= 0) continue;
        const entry = byProduct.get(item.productId) || { productId: item.productId, productName: item.productName, quantity: 0, orders: [] };
        entry.quantity += qty;
        entry.orders.push({
          orderId: order.id,
          orderCode: order.orderCode,
          status: order.status,
          quantity: qty,
          depositCovered: isDepositCovered({ depositRequired: Number(order.depositRequired), amountPaid: Number(order.amountPaid) }),
          estimatedReadyAt: order.estimatedReadyAt,
        });
        byProduct.set(item.productId, entry);
      }
    }
    return { data: [...byProduct.values()] };
  }

  async findAll(tenantId: string) {
    const orders = await this.orderRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });

    return { data: orders };
  }

  async findOne(id: string, tenantId: string) {
    const order = await this.orderRepository.findOne({
      where: { id, tenantId },
    });

    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return order;
  }

  /**
   * Datos del enlace público de seguimiento de un pedido, para compartirlo con
   * el cliente desde el panel. Pedidos anteriores o creados antes de que el
   * panel generara el token lo reciben aquí la primera vez.
   */
  async getTrackingLink(id: string, tenantId: string) {
    const order = await this.findOne(id, tenantId);
    if (!order.trackingToken) {
      order.trackingToken = randomBytes(24).toString('hex');
      await this.orderRepository.update({ id: order.id, tenantId }, { trackingToken: order.trackingToken });
    }
    const config = await this.marketplaceConfigService.getConfig(tenantId);
    return { orderCode: order.orderCode, token: order.trackingToken, store: config?.slug || tenantId };
  }

  async findByStatus(tenantId: string, status: OrderStatus) {
    const orders = await this.orderRepository.find({
      where: { tenantId, status },
      order: { createdAt: 'DESC' },
    });

    return { data: orders };
  }

  async updateStatus(
    id: string,
    tenantId: string,
    newStatus: OrderStatus,
    reason?: string,
    payment: { paymentType?: 'CONTADO' | 'CREDITO'; paymentMethod?: string } = {},
    options: { system?: boolean } = {},
  ) {
    const order = await this.findOne(id, tenantId);
    const previousStatus = order.status;

    // Domicilio con Shotra: En reparto y Entregado los pone el sistema según el contrato
    if (order.shotraRequestId && !options.system
      && (newStatus === OrderStatus.OUT_FOR_DELIVERY || newStatus === OrderStatus.DELIVERED)) {
      throw new BadRequestException(
        'Este pedido se entrega con Shotra: pasa a En reparto y a Entregado automáticamente según el contrato del domiciliario.',
      );
    }

    // Toda cancelación debe quedar justificada (se valida antes de tocar stock)
    const cancellationReason = (reason || '').trim();
    if (newStatus === OrderStatus.CANCELLED && cancellationReason.length < 5) {
      throw new BadRequestException('Debes indicar el motivo de la cancelación (mínimo 5 caracteres)');
    }

    // Validar transiciones permitidas
    const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
      [OrderStatus.DRAFT]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
      [OrderStatus.CONFIRMED]: [OrderStatus.IN_PRODUCTION, OrderStatus.CANCELLED],
      [OrderStatus.IN_PRODUCTION]: [OrderStatus.READY, OrderStatus.CANCELLED],
      // Listo → en reparto (domicilio) o entregado directo (recoge en tienda)
      [OrderStatus.READY]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED]: [OrderStatus.INVOICED, OrderStatus.CANCELLED],
      [OrderStatus.INVOICED]: [],
      [OrderStatus.CANCELLED]: [],
    };

    if (!allowedTransitions[order.status]?.includes(newStatus)) {
      throw new BadRequestException(
        `No se puede cambiar el estado de ${order.status} a ${newStatus}`,
      );
    }

    // Validar que tenga items al confirmar
    if (newStatus === OrderStatus.CONFIRMED) {
      if (!order.items || order.items.length === 0) {
        throw new BadRequestException(
          'El pedido debe tener al menos un item para ser confirmado',
        );
      }

      // Reservar stock de productos al confirmar (solo aplica a pedidos
      // creados por el panel, que nacen en DRAFT; los de marketplace ya se
      // reservan en saveMarketplaceOrder() porque nacen directo en CONFIRMED).
      // Un borrador puede crearse sin stock (sirve de cotización), pero NO se
      // confirma si no hay stock disponible para todos sus ítems.
      // Los productos "bajo pedido" pueden confirmarse sin stock (quedan por fabricar).
      const stock = await this.dataSource.transaction((manager) => reserveOrderStock(manager, tenantId, order.items));
      order.items = stock.items;
      order.productionLeadHours = stock.maxLeadHours || null;
    }

    // Anticipo: no se fabrica ni se prepara sin el anticipo verificado
    if (newStatus === OrderStatus.IN_PRODUCTION && order.paymentPlan && PLANS_WITH_DEPOSIT.includes(order.paymentPlan as PaymentPlan)
      && !isDepositCovered({ depositRequired: Number(order.depositRequired), amountPaid: Number(order.amountPaid) })) {
      throw new BadRequestException(
        `Falta el anticipo verificado ($${Number(order.depositRequired).toLocaleString('es-CO')}) para iniciar la preparación.`,
      );
    }

    // Listo: lo que estaba por fabricar ya debe estar en stock (lote de producción)
    if (newStatus === OrderStatus.READY && (order.items || []).some((i) => toManufactureOf(i as any) > 0)) {
      order.items = await this.dataSource.transaction((manager) => reserveManufactured(manager, tenantId, order.items));
    }

    // Plan separe: solo se entrega pagado al 100 %
    if ((newStatus === OrderStatus.DELIVERED || newStatus === OrderStatus.OUT_FOR_DELIVERY)
      && order.paymentPlan === 'PLAN_SEPARE' && balanceDue(order) > 0) {
      throw new BadRequestException(
        `El plan separe se entrega pagado al 100 %. Saldo pendiente: $${balanceDue(order).toLocaleString('es-CO')}.`,
      );
    }

    // Liberar stock reservado si se cancela un pedido que aún no fue entregado
    // (si ya fue DELIVERED, la reserva ya se liberó al entregar — ver abajo)
    if (newStatus === OrderStatus.CANCELLED && previousStatus !== OrderStatus.DRAFT && previousStatus !== OrderStatus.DELIVERED) {
      // Solo lo reservado: lo que estaba por fabricar nunca se apartó
      const resolved = await resolveStockLines(this.dataSource.manager, tenantId, reservedLines(order.items as any), { skipMissing: true });
      await applyStockDelta(this.dataSource.manager, tenantId, resolved, { reserved: -1 });
    }

    // Cancelar un pedido ya entregado: el stock real ya salió del inventario,
    // hay que devolverlo (reversa) en vez de tocar la reserva.
    if (newStatus === OrderStatus.CANCELLED && previousStatus === OrderStatus.DELIVERED) {
      const resolved = await resolveStockLines(this.dataSource.manager, tenantId, order.items, { skipMissing: true });
      await applyStockDelta(this.dataSource.manager, tenantId, resolved, { onHand: 1 });
      for (const line of resolved) {
        await this.inventoryMovementRepository.save(
          this.inventoryMovementRepository.create({
            strTenantId: tenantId,
            ...movementTarget(line),
            strType: 'IN',
            strReason: 'ADJUSTMENT',
            fltQuantity: line.baseQuantity,
            fltUnitPrice: line.baseUnitPrice,
            strReferenceId: order.id,
            strNotes: `Cancelación de pedido entregado ${order.orderCode}`,
            dtmDate: new Date(),
          }),
        );
      }
    }

    // Al entregar: descuenta el stock real (sale del inventario), libera la
    // reserva y registra la salida en el Kardex — antes solo se liberaba la
    // reserva y el stock real nunca bajaba.
    if (newStatus === OrderStatus.DELIVERED) {
      const resolved = await resolveStockLines(this.dataSource.manager, tenantId, order.items, { skipMissing: true });
      await applyStockDelta(this.dataSource.manager, tenantId, resolved, { onHand: -1, reserved: -1 });
      for (const line of resolved) {
        await this.inventoryMovementRepository.save(
          this.inventoryMovementRepository.create({
            strTenantId: tenantId,
            ...movementTarget(line),
            strType: 'OUT',
            strReason: 'SALE',
            fltQuantity: line.baseQuantity,
            fltUnitPrice: line.baseUnitPrice,
            strReferenceId: order.id,
            strNotes: `Pedido ${order.orderCode}`,
            dtmDate: new Date(),
          }),
        );
      }
    }

    order.status = newStatus;
    this.enterStage(order, newStatus, await this.getTimingSettings(tenantId));
    if (newStatus === OrderStatus.CANCELLED) {
      order.cancellationReason = cancellationReason;
      order.cancelledAt = new Date();
      // Con pagos verificados el negocio debe decidir la devolución
      if (Number(order.amountPaid) > 0) order.refundPending = true;
    }

    // Facturar: forma de pago. A crédito se valida el cupo y se crea la
    // cuenta por cobrar en la misma transacción que el cambio de estado.
    if (newStatus === OrderStatus.INVOICED) {
      const isCredit = payment.paymentType === 'CREDITO';
      const pending = balanceDue(order);
      if (order.paymentPlan && !isCredit && pending > 0) {
        throw new BadRequestException(
          `Registra el saldo pendiente ($${pending.toLocaleString('es-CO')}) antes de facturar, o factura el saldo a crédito.`,
        );
      }
      order.paymentType = isCredit ? 'CREDITO' : 'CONTADO';
      order.paymentMethod = isCredit ? null : (payment.paymentMethod || 'EFECTIVO');
      order.invoicedAt = new Date();
      if (isCredit) {
        const saved = await this.dataSource.transaction(async (manager) => {
          await this.creditService.createReceivableForCreditSale(manager, tenantId, {
            customerId: order.customerId || null,
            customerName: (order.customerName || 'Cliente').split(' | ')[0],
            sourceType: 'ORDER',
            sourceId: order.id,
            documentCode: order.orderCode,
            // Si ya hubo anticipos/abonos, a crédito queda solo el saldo
            amount: order.paymentPlan ? pending : Number(order.total) || 0,
          });
          return manager.save(order);
        });
        return { message: 'Pedido facturado a crédito', order: saved };
      }
    }

    const updatedOrder = await this.orderRepository.save(order);

    return { message: 'Estado actualizado exitosamente', order: updatedOrder };
  }

  async update(id: string, tenantId: string, updateDto: Partial<CreateOrderDto>) {
    const order = await this.findOne(id, tenantId);

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden editar pedidos en estado DRAFT',
      );
    }

    const { scheduledStart, allowSlotOverride, ...rest } = updateDto;
    if (rest.items) {
      rest.items = (await this.pricingService.priceLines(tenantId, rest.items, 'POS', 'SUGGEST')).items;
      rest.items = await expandComboLines(this.dataSource.manager, tenantId, rest.items);
    }
    Object.assign(order, {
      ...rest,
      deliveryDate: rest.deliveryDate ? new Date(rest.deliveryDate) : order.deliveryDate,
    });

    // Franja: null/'' la quita; una hora nueva se valida como al crear
    if (scheduledStart === null || scheduledStart === '') {
      order.scheduledStart = null;
      order.scheduledEnd = null;
    } else if (scheduledStart && new Date(scheduledStart).getTime() !== new Date(order.scheduledStart || 0).getTime()) {
      const slot = await this.resolvePanelSchedule(tenantId, scheduledStart, order.items || [], !!allowSlotOverride, order.id);
      order.scheduledStart = slot.start;
      order.scheduledEnd = slot.end;
      order.deliveryDate = new Date(`${bogotaDate(slot.start)}T12:00:00-05:00`);
    }

    const updatedOrder = await this.orderRepository.save(order);
    return { message: 'Pedido actualizado exitosamente', order: updatedOrder };
  }

  async remove(id: string, tenantId: string) {
    const order = await this.findOne(id, tenantId);

    if (order.status !== OrderStatus.DRAFT) {
      throw new BadRequestException(
        'Solo se pueden eliminar pedidos en estado DRAFT',
      );
    }

    await this.orderRepository.remove(order);
    return { message: 'Pedido eliminado exitosamente' };
  }

  async getStats(tenantId: string) {
    const orders = await this.orderRepository.find({
      where: { tenantId },
    });

    const stats = {
      total: orders.length,
      [OrderStatus.DRAFT]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.IN_PRODUCTION]: 0,
      [OrderStatus.READY]: 0,
      [OrderStatus.OUT_FOR_DELIVERY]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.INVOICED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    orders.forEach((order) => {
      stats[order.status]++;
    });

    return stats;
  }
}
