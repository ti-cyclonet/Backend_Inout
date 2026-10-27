import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { Order } from '../orders/entities/order.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { TenantBrandingService } from '../tenant-branding/tenant-branding.service';

const DAY = 86400000;
/** Momentos para invitar a opinar (una sola vez; el usuario la puede descartar). */
export const MILESTONES = { days: 30, sales: 100 };

export interface FeedbackUser { id: string; email?: string | null; tenantId: string }
export interface FeedbackInput {
  rating?: unknown; comment?: string; highlights?: unknown; consentPublish?: unknown; consentLogo?: unknown;
  authorName?: string; city?: string;
}

/**
 * Opiniones de los usuarios de InOut: se completan con el nombre y el logo del
 * negocio y se guardan en Authoriza, donde se aprueban para las landings.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly authorizaUrl = (process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');

  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly params: BusinessParamsService,
    private readonly branding: TenantBrandingService,
  ) {}

  private headers() {
    return { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' };
  }

  async submit(user: FeedbackUser, input: FeedbackInput) {
    if (!user?.tenantId || !user?.id) throw new BadRequestException('Sesión sin negocio.');
    const [params, brand] = await Promise.all([
      this.params.getParams(user.tenantId).catch(() => ({} as Record<string, any>)),
      this.branding.get(user.tenantId).catch(() => null),
    ]);
    const body = {
      application: 'InOut',
      tenantId: user.tenantId,
      userId: user.id,
      authorEmail: user.email || null,
      authorName: String(input?.authorName || '').trim().slice(0, 120) || user.email?.split('@')[0] || 'Cliente',
      businessName: String(params['NEGOCIO_NOMBRE'] ?? '').trim() || null,
      city: String(input?.city || '').trim().slice(0, 80) || null,
      logoUrl: brand?.logoWebUrl || brand?.logoUrl || null,
      rating: Number(input?.rating),
      comment: String(input?.comment || ''),
      highlights: Array.isArray(input?.highlights) ? input.highlights : [],
      consentPublish: input?.consentPublish === true,
      consentLogo: input?.consentLogo === true,
    };
    const res = await fetch(`${this.authorizaUrl}/api/testimonials`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpException(data?.message || 'No se pudo enviar tu opinión. Intenta más tarde.', res.status);
    return data;
  }

  /**
   * ¿Invitar a opinar? Solo si puede enviar otra (una cada 90 días) y el negocio
   * llegó a un buen momento: un mes usando InOut, 100 ventas o su primer pedido
   * del Market. Devuelve el motivo para el mensaje de la invitación.
   */
  async invitation(user: FeedbackUser) {
    let canSubmit = true;
    try {
      const res = await fetch(`${this.authorizaUrl}/api/testimonials/user/${encodeURIComponent(user.id)}?application=InOut`, { headers: this.headers() });
      if (res.ok) canSubmit = !!(await res.json())?.canSubmit;
    } catch (e) {
      this.logger.warn(`Invitación a opinar: ${(e as Error).message}`);
    }
    if (!canSubmit) return { canSubmit: false, invite: false, reason: null };

    const t = user.tenantId;
    const [salesCount, marketOrders, firstSale, firstOrder] = await Promise.all([
      this.sales.count({ where: { strTenantId: t } }),
      this.orders.count({ where: { tenantId: t, source: 'MARKET' } as any }),
      this.sales.createQueryBuilder('s').select('MIN(s.dtmCreationDate)', 'at').where('s.strTenantId = :t', { t }).getRawOne(),
      this.orders.createQueryBuilder('o').select('MIN(o.createdAt)', 'at').where('o.tenantId = :t', { t }).getRawOne(),
    ]);
    const firsts = [firstSale?.at, firstOrder?.at].filter(Boolean).map((d) => new Date(d).getTime());
    const since = firsts.length ? Math.min(...firsts) : null;
    const reason = salesCount >= MILESTONES.sales ? `¡Llegaste a ${salesCount} ventas con InOut!`
      : marketOrders >= 1 ? 'Ya recibes pedidos por el Market.'
      : since && Date.now() - since >= MILESTONES.days * DAY ? 'Ya llevas un mes con InOut.'
      : null;
    return { canSubmit: true, invite: !!reason, reason };
  }
}
