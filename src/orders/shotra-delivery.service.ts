import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrdersService } from './orders.service';

/** Respuesta de Shotra: GET /internal/requests/:id/delivery-status (clave interna). */
interface ShotraDeliveryStatus {
  requestId: string;
  requestStatus: string;
  contract: { code: string; status: string; signed: boolean; completedAt: string | null } | null;
}

/** Estados de la solicitud/contrato de Shotra que dejan el domicilio sin efecto. */
const SHOTRA_DEAD_REQUEST = ['CANCELLED', 'EXPIRED'];
const SHOTRA_DEAD_CONTRACT = ['CANCELLED'];
const SHOTRA_DONE_CONTRACT = ['COMPLETED', 'EVALUATED'];
const SHOTRA_ON_THE_WAY = ['SIGNED', 'IN_PROGRESS', 'PENDING_CONFIRMATION'];

/**
 * Pedidos que se entregan con un domiciliario de Shotra.
 *
 * Al pedir el domicilio desde un pedido, la solicitud de Shotra queda ligada
 * (order.shotraRequestId). Desde ahí el pedido NO se avanza a mano a En reparto
 * ni a Entregado: lo hace el sistema según el contrato en Shotra (ambos
 * firmaron → En reparto; contrato cerrado → Entregado). Si la solicitud se
 * cancela o vence, el pedido se desliga y vuelve el avance manual.
 */
@Injectable()
export class ShotraDeliveryService {
  private readonly logger = new Logger(ShotraDeliveryService.name);
  private running = false;

  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    private readonly ordersService: OrdersService,
  ) {}

  private get baseUrl(): string {
    // Red interna de Docker en producción; en local, SHOTRA_INTERNAL_URL
    return (process.env.SHOTRA_INTERNAL_URL || 'http://cyclonet-shotra-api:4100/api').replace(/\/+$/, '');
  }

  private async fetchStatus(requestId: string): Promise<ShotraDeliveryStatus | null> {
    const key = process.env.INTERNAL_API_KEY || '';
    if (!key) throw new BadRequestException('Falta INTERNAL_API_KEY para consultar Shotra.');
    const res = await fetch(`${this.baseUrl}/internal/requests/${encodeURIComponent(requestId)}/delivery-status`, {
      headers: { 'x-internal-key': key },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Shotra respondió ${res.status}`);
    return (await res.json()) as ShotraDeliveryStatus;
  }

  /** Liga el pedido a la solicitud de domicilio publicada en Shotra. */
  async link(tenantId: string, orderId: string, shotraRequestId: string) {
    const order = await this.orderRepository.findOne({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Pedido no encontrado');
    if (![OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY].includes(order.status)) {
      throw new BadRequestException('Solo un pedido Listo o En reparto se puede entregar con Shotra.');
    }
    const status = await this.fetchStatus(shotraRequestId);
    if (!status) throw new NotFoundException('La solicitud de Shotra no existe.');
    order.shotraRequestId = shotraRequestId;
    await this.orderRepository.save(order);
    await this.syncOrder(order).catch(() => undefined);
    return this.orderRepository.findOne({ where: { id: orderId, tenantId } });
  }

  /** Sincroniza ya (tras cerrar el contrato desde el panel de Domicilios). */
  async syncTenant(tenantId: string, shotraRequestId?: string) {
    const orders = await this.orderRepository.find({
      where: {
        tenantId,
        shotraRequestId: shotraRequestId || Not(IsNull()),
        status: In([OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY]),
      },
    });
    let updated = 0;
    for (const order of orders) if (await this.syncOrder(order).catch(() => false)) updated++;
    return { checked: orders.length, updated };
  }

  /** Revisa los pedidos con domicilio de Shotra en curso, cada 2 minutos. */
  @Cron('*/2 * * * *')
  async syncAll(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const orders = await this.orderRepository.find({
        where: { shotraRequestId: Not(IsNull()), status: In([OrderStatus.READY, OrderStatus.OUT_FOR_DELIVERY]) },
        take: 200,
      });
      let updated = 0;
      for (const order of orders) {
        try {
          if (await this.syncOrder(order)) updated++;
        } catch (err: any) {
          this.logger.warn(`No se pudo sincronizar el pedido ${order.orderCode} con Shotra: ${err?.message || err}`);
        }
      }
      return updated;
    } finally {
      this.running = false;
    }
  }

  /** Aplica al pedido el estado del contrato en Shotra. Devuelve si cambió. */
  async syncOrder(order: Order): Promise<boolean> {
    if (!order.shotraRequestId) return false;
    const s = await this.fetchStatus(order.shotraRequestId);
    const contractStatus = s?.contract?.status || null;

    // Domicilio sin efecto: se desliga y vuelve el avance manual
    if (!s || SHOTRA_DEAD_REQUEST.includes(s.requestStatus) || (contractStatus && SHOTRA_DEAD_CONTRACT.includes(contractStatus))) {
      await this.orderRepository.update({ id: order.id }, { shotraRequestId: null });
      return true;
    }

    if (contractStatus && SHOTRA_DONE_CONTRACT.includes(contractStatus)) {
      await this.ordersService.updateStatus(order.id, order.tenantId, OrderStatus.DELIVERED, undefined, {}, { system: true });
      return true;
    }
    if (s.contract?.signed && contractStatus && SHOTRA_ON_THE_WAY.includes(contractStatus) && order.status === OrderStatus.READY) {
      await this.ordersService.updateStatus(order.id, order.tenantId, OrderStatus.OUT_FOR_DELIVERY, undefined, {}, { system: true });
      return true;
    }
    return false;
  }
}
