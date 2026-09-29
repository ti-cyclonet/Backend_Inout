import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, IsNull, LessThan, Not, Repository } from 'typeorm';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderPayment } from './entities/order-payment.entity';
import { OrdersService } from './orders.service';
import { MarketplaceConfigService } from '../marketplace-config/marketplace-config.service';
import { balanceDue, toBogotaDate } from './payment-plans';
import { bogotaToUtc } from './scheduling';
import { isDepositExpired, isLayawayExpired, layawayReminderDue } from './order-automation.rules';

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
)[c]);
const money = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n || 0);
const longDate = (d: Date | string) => new Date(typeof d === 'string' && d.length === 10 ? `${d}T12:00:00-05:00` : d)
  .toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'long', day: 'numeric', month: 'long' });
const time = (d: Date) => new Date(d).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' });

/**
 * Tareas automáticas de pedidos del MarketPlace (hora de Colombia):
 * - cada hora: cancela pedidos cuyo anticipo no llegó a tiempo (libera stock);
 * - 8:00: cancela planes separe vencidos y recuerda los que están por vencer;
 * - 18:00: resumen al negocio de los pedidos programados de mañana.
 * Los correos salen por las plantillas de Authoriza (/notifications/send).
 */
@Injectable()
export class OrderAutomationService {
  private readonly logger = new Logger(OrderAutomationService.name);
  private readonly authorizaUrl = (process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');
  private readonly appUrl = (process.env.INOUT_APP_URL || 'https://app.cyclonet.com.co').replace(/\/+$/, '');
  private businesses = new Map<string, { name: string; email: string | null; at: number }>();

  constructor(
    @InjectRepository(Order) private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderPayment) private readonly paymentRepository: Repository<OrderPayment>,
    private readonly ordersService: OrdersService,
    private readonly marketplaceConfigService: MarketplaceConfigService,
  ) {}

  // ─── Anticipos vencidos ───

  @Cron('5 * * * *', { timeZone: 'America/Bogota' })
  async cancelExpiredDeposits(now = new Date()): Promise<number> {
    const candidates = await this.orderRepository.find({
      where: { status: OrderStatus.CONFIRMED, depositDeadline: LessThan(now), paymentPlan: Not(IsNull()) },
    });
    if (!candidates.length) return 0;

    const pending = await this.paymentRepository.find({
      where: { orderId: In(candidates.map((o) => o.id)), status: 'PENDIENTE_VERIFICACION' },
      select: ['orderId'],
    });
    const withPendingVoucher = new Set(pending.map((p) => p.orderId));

    let cancelled = 0;
    for (const order of candidates) {
      if (!isDepositExpired(order, now, withPendingVoucher.has(order.id))) continue;
      if (await this.cancel(order, 'Anticipo no recibido a tiempo (cancelado automáticamente).', 'El anticipo no se recibió dentro del plazo.')) cancelled++;
    }
    if (cancelled) this.logger.log(`Pedidos cancelados por anticipo vencido: ${cancelled}`);
    return cancelled;
  }

  // ─── Plan separe: vencidos y recordatorios ───

  @Cron('0 8 * * *', { timeZone: 'America/Bogota' })
  async runLayawayTasks(now = new Date()): Promise<{ cancelled: number; reminded: number }> {
    const today = toBogotaDate(now);
    const orders = await this.orderRepository.find({
      where: {
        paymentPlan: 'PLAN_SEPARE',
        status: Not(In([OrderStatus.CANCELLED, OrderStatus.DELIVERED, OrderStatus.INVOICED])),
      },
    });

    let cancelled = 0;
    let reminded = 0;
    for (const order of orders) {
      if (isLayawayExpired(order, today)) {
        if (await this.cancel(order, 'Plan separe vencido sin completar el pago (cancelado automáticamente).', 'El plazo del plan separe venció sin completar el pago.')) cancelled++;
        continue;
      }
      const days = layawayReminderDue(order, today);
      if (days && order.customerEmail) {
        const ok = await this.sendMail(order.tenantId, order.customerEmail, 'MARKETPLACE_LAYAWAY_REMINDER', {
          customerName: esc(this.customerName(order)),
          businessName: esc((await this.business(order.tenantId)).name),
          orderCode: esc(order.orderCode),
          daysLeft: String(days),
          deadline: longDate(order.layawayDeadline!),
          amountPaid: money(Number(order.amountPaid)),
          balance: money(balanceDue(order)),
          trackingUrl: await this.trackingUrl(order),
          year: String(new Date().getFullYear()),
        });
        if (ok) reminded++;
      }
    }
    if (cancelled || reminded) this.logger.log(`Plan separe: ${cancelled} cancelado(s), ${reminded} recordatorio(s)`);
    return { cancelled, reminded };
  }

  // ─── Resumen de programados de mañana ───

  @Cron('0 18 * * *', { timeZone: 'America/Bogota' })
  async sendTomorrowSummary(now = new Date()): Promise<number> {
    const tomorrow = toBogotaDate(new Date(now.getTime() + 86400000));
    const orders = await this.orderRepository.find({
      where: {
        status: Not(In([OrderStatus.CANCELLED, OrderStatus.INVOICED])),
        scheduledStart: Between(bogotaToUtc(tomorrow, 0), bogotaToUtc(tomorrow, 24 * 60)),
      },
      order: { scheduledStart: 'ASC' },
    });

    const byTenant = new Map<string, Order[]>();
    for (const o of orders) byTenant.set(o.tenantId, [...(byTenant.get(o.tenantId) || []), o]);

    let sent = 0;
    for (const [tenantId, list] of byTenant) {
      const business = await this.business(tenantId);
      if (!business.email) continue;
      const rows = list.map((o) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">${time(o.scheduledStart!)}${o.scheduledEnd ? ' – ' + time(o.scheduledEnd) : ''}</td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee"><strong>${esc(o.orderCode)}</strong><br><span style="color:#666">${esc(this.customerName(o))}</span></td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${money(Number(o.total))}${balanceDue(o) > 0 && o.paymentPlan && o.paymentPlan !== 'CREDITO' ? `<br><span style="color:#b45309">Saldo ${money(balanceDue(o))}</span>` : ''}</td>
        </tr>`).join('');
      const ok = await this.sendMail(tenantId, business.email, 'INOUT_SCHEDULED_ORDERS_SUMMARY', {
        businessName: esc(business.name),
        date: longDate(tomorrow),
        count: String(list.length),
        ordersTable: rows,
        panelUrl: `${this.appUrl}/orders`,
        year: String(new Date().getFullYear()),
      });
      if (ok) sent++;
    }
    if (sent) this.logger.log(`Resumen de programados enviado a ${sent} negocio(s)`);
    return sent;
  }

  // ─── Helpers ───

  /** Cancela con la lógica normal (libera stock, marca devolución) y avisa al cliente. */
  private async cancel(order: Order, reason: string, customerReason: string): Promise<boolean> {
    try {
      await this.ordersService.updateStatus(order.id, order.tenantId, OrderStatus.CANCELLED, reason);
    } catch (err) {
      this.logger.warn(`No se pudo cancelar ${order.orderCode}: ${(err as Error).message}`);
      return false;
    }
    if (order.customerEmail) {
      await this.sendMail(order.tenantId, order.customerEmail, 'MARKETPLACE_ORDER_CANCELLED', {
        customerName: esc(this.customerName(order)),
        businessName: esc((await this.business(order.tenantId)).name),
        orderCode: esc(order.orderCode),
        reason: esc(customerReason),
        refundText: Number(order.amountPaid) > 0
          ? `Registramos pagos por ${money(Number(order.amountPaid))}; la tienda se comunicará contigo para la devolución.`
          : '',
        year: String(new Date().getFullYear()),
      });
    }
    return true;
  }

  private customerName(order: Order): string {
    return (order.customerName || 'Cliente').split(' | ')[0];
  }

  private async trackingUrl(order: Order): Promise<string> {
    if (!order.trackingToken) return `${this.appUrl}`;
    const config = await this.marketplaceConfigService.getConfig(order.tenantId).catch(() => null);
    return `${this.appUrl}/marketplace/${config?.slug || order.tenantId}/pedido/${order.trackingToken}`;
  }

  /** Nombre y correo del dueño del negocio (contrato en Authoriza), en caché 1 hora. */
  private async business(tenantId: string): Promise<{ name: string; email: string | null }> {
    const cached = this.businesses.get(tenantId);
    if (cached && Date.now() - cached.at < 3600_000) return cached;
    let name = 'la tienda';
    let email: string | null = null;
    try {
      const res = await fetch(`${this.authorizaUrl}/api/contracts/tenant/${tenantId}`);
      if (res.ok) {
        const c: any = await res.json();
        const bd = c?.user?.basicData;
        name = bd?.legalEntityData?.businessName
          || [bd?.naturalPersonData?.firstName, bd?.naturalPersonData?.firstSurname].filter(Boolean).join(' ')
          || name;
        email = c?.user?.strUserName || null;
      }
    } catch { /* se usan valores genéricos */ }
    const entry = { name, email, at: Date.now() };
    this.businesses.set(tenantId, entry);
    return entry;
  }

  private async sendMail(tenantId: string, to: string, templateCode: string, variables: Record<string, string>): Promise<boolean> {
    try {
      const res = await fetch(`${this.authorizaUrl}/api/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
        body: JSON.stringify({ to, templateCode, variables, tenantId }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) throw new Error(body?.message || `HTTP ${res.status}`);
      return true;
    } catch (err) {
      this.logger.warn(`No se pudo enviar ${templateCode} a ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
