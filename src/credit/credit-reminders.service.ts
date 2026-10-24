import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CreditService, money, todayCo } from './credit.service';
import { Receivable } from './entities/receivable.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { TenantBrandingService } from '../tenant-branding/tenant-branding.service';

type ReminderKind = 'PROXIMO' | 'HOY' | 'VENCIDA';

const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
)[c]);

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Recordatorios de vencimiento de cartera por correo al cliente, con la
 * plantilla CREDIT_PAYMENT_REMINDER de Authoriza (servicio de correo del
 * ecosistema). Automáticos (tarea diaria) para los negocios que los activan,
 * y manuales desde la pestaña Cartera.
 */
@Injectable()
export class CreditRemindersService {
  private readonly logger = new Logger(CreditRemindersService.name);
  private readonly authorizaUrl = (process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');
  private brands = new Map<string, { name: string; logoUrl: string | null; at: number }>();

  constructor(
    private readonly creditService: CreditService,
    private readonly businessParams: BusinessParamsService,
    private readonly branding: TenantBrandingService,
  ) {}

  /** Todos los días a las 8:00 a. m. (hora de Colombia). */
  @Cron('0 8 * * *', { timeZone: 'America/Bogota' })
  async runDailyReminders(): Promise<void> {
    const tenants = await this.creditService.tenantsWithReminders();
    for (const tenantId of tenants) {
      try {
        const sent = await this.runForTenant(tenantId);
        if (sent) this.logger.log(`Recordatorios de cartera enviados (${tenantId}): ${sent}`);
      } catch (err) {
        this.logger.error(`Recordatorios de cartera (${tenantId}): ${(err as Error).message}`);
      }
    }
  }

  async runForTenant(tenantId: string): Promise<number> {
    const { settings, rows } = await this.creditService.openReceivablesForReminders(tenantId);
    if (!settings.remindersEnabled) return 0;
    const today = todayCo();
    let sent = 0;
    for (const { entity, view, email } of rows) {
      if (!email) continue;
      const lastDay = entity.lastReminderAt ? new Date(entity.lastReminderAt.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10) : null;
      if (lastDay === today) continue; // máximo uno por día

      let kind: ReminderKind | null = null;
      if (!view.isOverdue && view.daysToDue === settings.reminderDaysBefore) kind = 'PROXIMO';
      else if (view.daysToDue === 0) kind = 'HOY';
      else if (view.isOverdue) {
        const daysSinceLast = lastDay ? Math.round((Date.parse(today) - Date.parse(lastDay)) / 86400000) : Infinity;
        if (daysSinceLast >= settings.overdueReminderEveryDays) kind = 'VENCIDA';
      }
      if (!kind) continue;

      if (await this.send(tenantId, entity, view, email, kind)) sent++;
    }
    return sent;
  }

  /** Envío manual desde Cartera. */
  async sendManual(tenantId: string, receivableId: string) {
    const { entity, view, email } = await this.creditService.findOpenReceivable(tenantId, receivableId);
    if (!email) {
      return { sent: false, reason: 'El cliente no tiene correo registrado en su crédito.' };
    }
    const kind: ReminderKind = view.isOverdue ? 'VENCIDA' : view.daysToDue === 0 ? 'HOY' : 'PROXIMO';
    const sent = await this.send(tenantId, entity, view, email, kind);
    return sent ? { sent: true, email } : { sent: false, reason: 'No se pudo enviar el correo. Intenta más tarde.' };
  }

  private async send(tenantId: string, entity: Receivable, view: any, email: string, kind: ReminderKind): Promise<boolean> {
    const statusText = kind === 'VENCIDA'
      ? `está vencida hace ${view.daysOverdue} día(s)`
      : kind === 'HOY' ? 'vence hoy' : `vence en ${view.daysToDue} día(s)`;
    const brand = await this.brand(tenantId);
    const variables = {
      customerName: esc(view.customerName),
      businessName: esc(brand.name),
      // Logo de la tienda (PNG acotado de Cloudinary); vacío si no tiene
      logoBlock: brand.logoUrl
        ? `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" width="160" style="display:block;margin:0 auto 12px;max-width:160px;max-height:80px;width:auto;height:auto;border:0;">`
        : '',
      documentCode: esc(view.documentCode),
      dueDate: fmtDate(view.dueDate),
      statusText,
      statusColor: kind === 'VENCIDA' ? '#b91c1c' : kind === 'HOY' ? '#b45309' : '#0066cc',
      balance: money(view.balance),
      interest: view.interestPending > 0 ? `Intereses de mora: ${money(view.interestPending)}` : '',
      totalDue: money(view.totalDue),
      year: new Date().getFullYear().toString(),
    };
    try {
      const res = await fetch(`${this.authorizaUrl}/api/notifications/send`, {
        method: 'POST',
        // /notifications/send exige la clave interna entre servicios
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
        body: JSON.stringify({ to: email, templateCode: 'CREDIT_PAYMENT_REMINDER', variables, tenantId }),
      });
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok || body?.success === false) throw new Error(body?.message || `HTTP ${res.status}`);
      await this.creditService.markReminded(entity);
      return true;
    } catch (err) {
      this.logger.warn(`No se pudo enviar recordatorio ${view.documentCode} a ${email}: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Nombre y logo de la tienda, para que quien recibe el cobro la reconozca.
   * Nombre: parámetro NEGOCIO_NOMBRE del período activo; si no está, la razón
   * social o el nombre del titular del contrato en Authoriza. En caché 1 hora.
   */
  async brand(tenantId: string): Promise<{ name: string; logoUrl: string | null }> {
    const cached = this.brands.get(tenantId);
    if (cached && Date.now() - cached.at < 3600_000) return cached;
    let name = '';
    try {
      const params = await this.businessParams.getParams(tenantId);
      name = String(params['NEGOCIO_NOMBRE'] ?? '').trim();
    } catch { /* se usa el nombre del contrato */ }
    if (!name) {
      try {
        const res = await fetch(`${this.authorizaUrl}/api/contracts/tenant/${tenantId}`);
        if (res.ok) {
          const c: any = await res.json();
          const bd = c?.user?.basicData;
          name = bd?.legalEntityData?.businessName
            || [bd?.naturalPersonData?.firstName, bd?.naturalPersonData?.firstSurname].filter(Boolean).join(' ')
            || '';
        }
      } catch { /* se usa el nombre genérico */ }
    }
    let logoUrl: string | null = null;
    try {
      logoUrl = (await this.branding.get(tenantId)).logoPdfUrl;
    } catch { /* sin logo */ }
    const entry = { name: name || 'tu proveedor', logoUrl, at: Date.now() };
    this.brands.set(tenantId, entry);
    return entry;
  }
}
