import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
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

      // Reservar stock de productos al confirmar
      for (const item of order.items) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingReservedStock" = COALESCE("ingReservedStock", 0) + $1 WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
        }
      }
    }

    // Liberar stock reservado si se cancela un pedido confirmado
    if (newStatus === OrderStatus.CANCELLED && order.status !== OrderStatus.DRAFT) {
      for (const item of (order.items || [])) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingReservedStock" = GREATEST(0, COALESCE("ingReservedStock", 0) - $1) WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
          );
        }
      }
    }

    // Liberar reserva cuando se entrega (ya se descontó del stock real)
    if (newStatus === OrderStatus.DELIVERED) {
      for (const item of (order.items || [])) {
        if (item.productId) {
          await this.dataSource.query(
            `UPDATE manufacturing.products SET "ingReservedStock" = GREATEST(0, COALESCE("ingReservedStock", 0) - $1) WHERE "strId" = $2 AND "strTenantId" = $3`,
            [item.quantity, item.productId, tenantId]
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
