import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto';
import { applyStockDelta, assertStockAvailable, movementTarget, resolveStockLines } from '../common/stock-availability';

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
    private dataSource: DataSource,
  ) {}

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
    const orderCode = await this.generateOrderCode(tenantId);

    const order = this.orderRepository.create({
      tenantId,
      orderCode,
      status: OrderStatus.DRAFT,
      customerId: createDto.customerId || null,
      customerName: createDto.customerName || null,
      items: createDto.items || null,
      notes: createDto.notes || null,
      deliveryDate: createDto.deliveryDate ? new Date(createDto.deliveryDate) : null,
      subtotal: createDto.subtotal || 0,
      tax: createDto.tax || 0,
      discount: createDto.discount || 0,
      total: createDto.total || 0,
    });

    const savedOrder = await this.orderRepository.save(order);
    return { message: 'Pedido creado exitosamente', order: savedOrder };
  }

  /** Checkout anónimo (sin sesión): sigue funcionando igual que antes — no es
   * obligatorio iniciar sesión para comprar. Si el comprador dio su correo,
   * además queda registrado en Authoriza como cliente potencial (best-effort,
   * no bloquea el pedido si esa llamada falla). */
  async createFromMarketplace(createDto: CreateMarketplaceOrderDto, meta: ConsentMeta = {}) {
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

    if (createDto.acceptTerms !== true || createDto.acceptHabeasData !== true) {
      throw new BadRequestException(
        'Debes aceptar los Términos y Condiciones y autorizar el tratamiento de tus datos personales para hacer el pedido.',
      );
    }
    const consents = {
      termsVersion: createDto.termsVersion,
      habeasDataVersion: createDto.habeasDataVersion,
      acceptedAt: new Date().toISOString(),
      ipAddress: meta.ipAddress?.slice(0, 64) || null,
      userAgent: meta.userAgent?.slice(0, 500) || null,
    };

    return this.dataSource.transaction(async (manager) => {
      const resolved = await assertStockAvailable(manager, tenantId, createDto.items);

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
        items: createDto.items,
        notes: createDto.notes || null,
        subtotal: createDto.subtotal || 0,
        tax: createDto.tax || 0,
        discount: 0,
        total: createDto.total || 0,
        consents,
      });
      const savedOrder = await manager.save(order);

      await applyStockDelta(manager, tenantId, resolved, { reserved: 1 });

      return savedOrder;
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

  async findByStatus(tenantId: string, status: OrderStatus) {
    const orders = await this.orderRepository.find({
      where: { tenantId, status },
      order: { createdAt: 'DESC' },
    });

    return { data: orders };
  }

  async updateStatus(id: string, tenantId: string, newStatus: OrderStatus, reason?: string) {
    const order = await this.findOne(id, tenantId);
    const previousStatus = order.status;

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
      [OrderStatus.READY]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
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
      await this.dataSource.transaction(async (manager) => {
        const resolved = await assertStockAvailable(manager, tenantId, order.items);
        await applyStockDelta(manager, tenantId, resolved, { reserved: 1 });
      });
    }

    // Liberar stock reservado si se cancela un pedido que aún no fue entregado
    // (si ya fue DELIVERED, la reserva ya se liberó al entregar — ver abajo)
    if (newStatus === OrderStatus.CANCELLED && previousStatus !== OrderStatus.DRAFT && previousStatus !== OrderStatus.DELIVERED) {
      const resolved = await resolveStockLines(this.dataSource.manager, tenantId, order.items, { skipMissing: true });
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
    if (newStatus === OrderStatus.CANCELLED) {
      order.cancellationReason = cancellationReason;
      order.cancelledAt = new Date();
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

    Object.assign(order, {
      ...updateDto,
      deliveryDate: updateDto.deliveryDate ? new Date(updateDto.deliveryDate) : order.deliveryDate,
    });

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
