import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory-movements/entities/inventory-movement.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateMarketplaceOrderDto } from './dto/create-marketplace-order.dto';

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
  async createFromMarketplace(createDto: CreateMarketplaceOrderDto) {
    const savedOrder = await this.saveMarketplaceOrder(createDto, {
      customerId: null,
      customerName: `${createDto.customerName} | ${createDto.customerPhone}${createDto.customerAddress ? ' | ' + createDto.customerAddress : ''}`,
    });

    if (createDto.customerEmail) {
      this.registerPotentialCustomer(createDto).catch((err) =>
        console.error('No se pudo registrar el cliente potencial en Authoriza:', err?.message),
      );
    }

    const whatsapp = await this.getMarketplaceWhatsapp(createDto.tenantId);
    return {
      message: 'Pedido creado exitosamente desde marketplace',
      order: savedOrder,
      ...(whatsapp && { whatsapp }),
    };
  }

  /** Checkout de un clienteInout autenticado: el pedido queda vinculado a su
   * userId real de Authoriza en vez de solo un texto libre. */
  async createFromMarketplaceAuthenticated(createDto: CreateMarketplaceOrderDto, authUserId: string) {
    const savedOrder = await this.saveMarketplaceOrder(createDto, {
      customerId: authUserId,
      customerName: createDto.customerName,
    });

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
  ) {
    const { tenantId } = createDto;

    return this.dataSource.transaction(async (manager) => {
      for (const item of createDto.items) {
        if (!item.productId) continue;
        const product = await manager.findOne(Product, {
          where: { strId: item.productId, strTenantId: tenantId },
        });
        if (!product) {
          throw new NotFoundException(`Producto ${item.productName} no encontrado`);
        }
        const available =
          parseFloat(product.ingQuantity.toString()) - parseFloat((product.ingReservedStock || 0).toString());
        if (available < item.quantity) {
          throw new BadRequestException(`Stock insuficiente de "${product.strName}"`);
        }
      }

      const orderCode = await this.generateOrderCode(tenantId);
      const order = manager.create(Order, {
        tenantId,
        orderCode,
        status: OrderStatus.CONFIRMED,
        customerId: customer.customerId,
        customerName: customer.customerName,
        items: createDto.items,
        notes: createDto.notes || null,
        subtotal: createDto.subtotal || 0,
        tax: createDto.tax || 0,
        discount: 0,
        total: createDto.total || 0,
      });
      const savedOrder = await manager.save(order);

      for (const item of createDto.items) {
        if (!item.productId) continue;
        await manager.query(
          `UPDATE manufacturing.products SET "ingReservedStock" = COALESCE("ingReservedStock", 0) + $1 WHERE "strId" = $2 AND "strTenantId" = $3`,
          [item.quantity, item.productId, tenantId],
        );
      }

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
    await fetch(`${authorizaUrl}/api/potential-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: createDto.customerEmail,
        name: createDto.customerName,
        phone: createDto.customerPhone,
        sourceApplication: 'Inout',
        sourceTenantId: createDto.tenantId,
      }),
    });
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

  async updateStatus(id: string, tenantId: string, newStatus: OrderStatus) {
    const order = await this.findOne(id, tenantId);
    const previousStatus = order.status;

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
      // reservan en saveMarketplaceOrder() porque nacen directo en CONFIRMED)
      for (const item of order.items) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingReservedStock" = COALESCE("ingReservedStock", 0) + $1 WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
        }
      }
    }

    // Liberar stock reservado si se cancela un pedido que aún no fue entregado
    // (si ya fue DELIVERED, la reserva ya se liberó al entregar — ver abajo)
    if (newStatus === OrderStatus.CANCELLED && previousStatus !== OrderStatus.DRAFT && previousStatus !== OrderStatus.DELIVERED) {
      for (const item of (order.items || [])) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingReservedStock" = GREATEST(0, COALESCE("ingReservedStock", 0) - $1) WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
        }
      }
    }

    // Cancelar un pedido ya entregado: el stock real ya salió del inventario,
    // hay que devolverlo (reversa) en vez de tocar la reserva.
    if (newStatus === OrderStatus.CANCELLED && previousStatus === OrderStatus.DELIVERED) {
      for (const item of (order.items || [])) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingQuantity" = COALESCE("ingQuantity", 0) + $1 WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
          await this.inventoryMovementRepository.save(
            this.inventoryMovementRepository.create({
              strTenantId: tenantId,
              strProductId: item.productId,
              strType: 'IN',
              strReason: 'ADJUSTMENT',
              fltQuantity: item.quantity,
              fltUnitPrice: item.unitPrice,
              strReferenceId: order.id,
              strNotes: `Cancelación de pedido entregado ${order.orderCode}`,
              dtmDate: new Date(),
            }),
          );
        }
      }
    }

    // Al entregar: descuenta el stock real (sale del inventario), libera la
    // reserva y registra la salida en el Kardex — antes solo se liberaba la
    // reserva y el stock real nunca bajaba.
    if (newStatus === OrderStatus.DELIVERED) {
      for (const item of (order.items || [])) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingQuantity" = GREATEST(0, COALESCE("ingQuantity", 0) - $1), "ingReservedStock" = GREATEST(0, COALESCE("ingReservedStock", 0) - $1) WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
          await this.inventoryMovementRepository.save(
            this.inventoryMovementRepository.create({
              strTenantId: tenantId,
              strProductId: item.productId,
              strType: 'OUT',
              strReason: 'SALE',
              fltQuantity: item.quantity,
              fltUnitPrice: item.unitPrice,
              strReferenceId: order.id,
              strNotes: `Pedido ${order.orderCode}`,
              dtmDate: new Date(),
            }),
          );
        }
      }
    }

    order.status = newStatus;
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
