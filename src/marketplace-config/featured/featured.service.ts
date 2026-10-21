import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, MoreThan, Repository } from 'typeorm';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { FeaturedStatus, MarketFeatured } from './market-featured.entity';
import {
  addDays, FEATURED_DAYS, FEATURED_SETTINGS_KEY, FeaturedPlan, FeaturedSettings, featuredEnabled, invoiceConcept,
  nextFreeStart, PAYMENT_WAIT_DAYS, priceOf, resolveFeaturedSettings,
} from './featured';

const OCCUPYING = [FeaturedStatus.ACTIVE, FeaturedStatus.PENDING_PAYMENT];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class FeaturedService {
  private readonly logger = new Logger(FeaturedService.name);

  constructor(
    @InjectRepository(MarketFeatured) private readonly featured: Repository<MarketFeatured>,
    @InjectRepository(PlatformSetting) private readonly platformSettings: Repository<PlatformSetting>,
  ) {}

  // ─── Ajustes (cuenta de CycloNet) ───

  async getSettings(): Promise<FeaturedSettings> {
    const row = await this.platformSettings.findOne({ where: { key: FEATURED_SETTINGS_KEY } });
    return resolveFeaturedSettings(row?.value);
  }

  async setSettings(body: any): Promise<FeaturedSettings> {
    const settings = resolveFeaturedSettings(body);
    await this.platformSettings.save({ key: FEATURED_SETTINGS_KEY, value: settings });
    return settings;
  }

  // ─── Vitrina ───

  /** Tiendas destacadas ahora (público, para ordenar la vitrina). */
  async activeTenantIds(now = new Date()): Promise<string[]> {
    const rows = await this.featured.find({ where: { status: FeaturedStatus.ACTIVE, endsAt: MoreThan(now) } });
    return [...new Set(rows.filter((r) => new Date(r.startsAt) <= now).map((r) => r.tenantId))];
  }

  // ─── Negocio ───

  private async occupying(): Promise<MarketFeatured[]> {
    return this.featured.find({ where: { status: In(OCCUPYING), endsAt: MoreThan(new Date()) } });
  }

  /** Oferta para el negocio: precios, próxima fecha libre por plan y sus compras. */
  async offer(tenantId: string) {
    const settings = await this.getSettings();
    const bookings = await this.occupying();
    const now = new Date();
    const plans = (['WEEK', 'MONTH'] as FeaturedPlan[])
      .filter((p) => priceOf(settings, p) > 0)
      .map((plan) => {
        const startsAt = nextFreeStart(bookings, settings.slots, FEATURED_DAYS[plan], now);
        return { plan, days: FEATURED_DAYS[plan], price: priceOf(settings, plan), startsAt, endsAt: addDays(startsAt, FEATURED_DAYS[plan]) };
      });
    const mine = await this.featured.find({ where: { tenantId }, order: { createdAt: 'DESC' }, take: 10 });
    return {
      enabled: featuredEnabled(settings),
      slots: settings.slots,
      plans,
      mine: mine.map((m) => ({
        id: m.id, plan: m.plan, days: m.days, price: Number(m.price), status: m.status,
        startsAt: m.startsAt, endsAt: m.endsAt, invoiceCode: m.invoiceCode, invoiceStatus: m.invoiceStatus,
      })),
    };
  }

  /** Solicita un destacado: reserva el cupo y emite la factura en Authoriza. */
  async request(tenantId: string, plan: FeaturedPlan) {
    if (plan !== 'WEEK' && plan !== 'MONTH') throw new BadRequestException('Elige 7 o 30 días.');
    const settings = await this.getSettings();
    const price = priceOf(settings, plan);
    if (!price) throw new BadRequestException('Este destacado no está disponible por ahora.');
    const open = await this.featured.findOne({ where: { tenantId, status: FeaturedStatus.PENDING_PAYMENT } });
    if (open) throw new BadRequestException(`Ya tienes un destacado esperando el pago (factura ${open.invoiceCode || 'en proceso'}).`);

    const days = FEATURED_DAYS[plan];
    const startsAt = nextFreeStart(await this.occupying(), settings.slots, days, new Date());
    const endsAt = addDays(startsAt, days);
    const invoice = await this.createInvoice(tenantId, price, invoiceConcept(plan, startsAt, endsAt), startsAt, endsAt);
    const row = await this.featured.save(this.featured.create({
      tenantId, plan, days, price, startsAt, endsAt,
      status: FeaturedStatus.PENDING_PAYMENT,
      invoiceId: String(invoice.id),
      invoiceCode: invoice.code || null,
      invoiceStatus: invoice.status || 'Issued',
    }));
    return { id: row.id, plan, days, price, startsAt, endsAt, invoiceCode: row.invoiceCode, status: row.status };
  }

  // ─── Pagos y vencimientos ───

  /**
   * Cada 15 minutos: activa lo pagado (corriendo el periodo si se pagó tarde),
   * libera el cupo de lo que no se pagó a tiempo (salvo pago reportado) y
   * vence lo que terminó. Una reserva cancelada que se paga después igual se
   * activa en la próxima fecha libre: el pago nunca se pierde.
   */
  @Cron('*/15 * * * *', { timeZone: 'America/Bogota' })
  async sync(now = new Date()): Promise<void> {
    const expired = await this.featured.find({ where: { status: FeaturedStatus.ACTIVE } });
    for (const r of expired.filter((x) => new Date(x.endsAt) <= now)) {
      r.status = FeaturedStatus.EXPIRED;
      await this.featured.save(r);
    }

    const recentCancelled = addDays(now, -60);
    const waiting = await this.featured.find({
      where: [
        { status: FeaturedStatus.PENDING_PAYMENT },
        { status: FeaturedStatus.CANCELLED, createdAt: MoreThan(recentCancelled) },
      ],
    });
    for (const r of waiting) {
      if (!r.invoiceId) continue;
      const status = await this.invoiceStatus(r.invoiceId);
      if (!status) continue;
      r.invoiceStatus = status;
      if (status === 'Paid') {
        const settings = await this.getSettings();
        const others = (await this.occupying()).filter((b) => b.id !== r.id);
        // Pagó tarde (o se había liberado el cupo): empieza en la próxima fecha libre
        const from = new Date(Math.max(now.getTime(), new Date(r.startsAt).getTime()));
        const startsAt = r.status === FeaturedStatus.PENDING_PAYMENT && new Date(r.startsAt) >= now
          ? new Date(r.startsAt)
          : nextFreeStart(others, settings.slots, r.days, from);
        r.startsAt = startsAt;
        r.endsAt = addDays(startsAt, r.days);
        r.status = FeaturedStatus.ACTIVE;
      } else if (
        r.status === FeaturedStatus.PENDING_PAYMENT
        && status !== 'Payment Reported'
        && addDays(new Date(r.createdAt), PAYMENT_WAIT_DAYS) <= now
      ) {
        r.status = FeaturedStatus.CANCELLED;
      }
      await this.featured.save(r);
    }
  }

  // ─── Authoriza ───

  private authoriza(path: string, init: RequestInit = {}) {
    const base = (process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');
    return fetch(`${base}/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '', ...(init.headers || {}) },
      signal: AbortSignal.timeout(10000),
    });
  }

  private async createInvoice(tenantId: string, value: number, concept: string, startsAt: Date, endsAt: Date) {
    const today = new Date();
    try {
      const res = await this.authoriza('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          userId: tenantId,
          value,
          issueDate: ymd(today),
          expirationDate: ymd(addDays(today, PAYMENT_WAIT_DAYS)),
          status: 'Issued',
          concept,
          periodStart: ymd(startsAt),
          periodEnd: ymd(endsAt),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`.trim());
      return (await res.json()) as { id: number | string; code?: string; status?: string };
    } catch (err) {
      this.logger.error(`No se pudo emitir la factura del destacado (${tenantId}): ${(err as Error).message}`);
      throw new ServiceUnavailableException('No pudimos emitir la factura en este momento. Intenta de nuevo en unos minutos.');
    }
  }

  private async invoiceStatus(id: string): Promise<string | null> {
    try {
      const res = await this.authoriza(`/invoices/${encodeURIComponent(id)}`);
      if (!res.ok) return null;
      return ((await res.json()) as any)?.status || null;
    } catch {
      return null;
    }
  }
}
