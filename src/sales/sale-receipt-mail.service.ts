import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { TenantBrandingService } from '../tenant-branding/tenant-branding.service';
import { groupComboLines } from '../combos/combo-lines';
import { LimitEnforcementService } from '../usage-counters/limit-enforcement.service';

export const RECEIPT_PDF_MAX_BYTES = 2 * 1024 * 1024;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const money = (n: unknown) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CO');
const METHODS: Record<string, string> = { EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transferencia', TARJETA: 'Tarjeta', NEQUI: 'Nequi', DAVIPLATA: 'Daviplata', OTRO: 'Otro' };

/** Correo simple (sin espacios, con @ y dominio con punto). */
export function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/**
 * Envía al cliente el comprobante de una venta directa: el correo (plantilla
 * INOUT_SALE_RECEIPT de Authoriza, con la marca del negocio) lleva el
 * detalle de la compra y el PDF del tiquete adjunto (lo genera la app).
 */
@Injectable()
export class SaleReceiptMailService {
  private readonly logger = new Logger(SaleReceiptMailService.name);
  private readonly authorizaUrl = (process.env.AUTHORIZA_API_URL || process.env.AUTHORIZA_URL || 'http://localhost:3000').replace(/\/+$/, '');

  constructor(
    @InjectRepository(Sale) private readonly sales: Repository<Sale>,
    private readonly businessParams: BusinessParamsService,
    private readonly branding: TenantBrandingService,
    private readonly limits: LimitEnforcementService,
  ) {}

  async send(tenantId: string, saleId: string, email: unknown, pdfBase64: unknown): Promise<{ success: true; to: string }> {
    const to = String(email ?? '').trim().toLowerCase();
    if (!isEmail(to)) throw new BadRequestException('Escribe un correo válido.');
    const pdf = Buffer.from(String(pdfBase64 ?? ''), 'base64');
    if (!pdf.length || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new BadRequestException('El comprobante debe ser un PDF.');
    if (pdf.length > RECEIPT_PDF_MAX_BYTES) throw new BadRequestException('El comprobante supera 2 MB.');

    const sale = await this.sales.findOne({ where: { strId: saleId, strTenantId: tenantId } });
    if (!sale) throw new NotFoundException('Venta no encontrada.');

    const variables = await this.variables(tenantId, sale);
    // Cuenta para los correos del plan (403 LIMIT_REACHED si no hay cupo)
    await this.limits.validateAndIncrement(tenantId, 'nCorreos');
    const code = sale.strInvoiceCode || 'venta';
    const res = await fetch(`${this.authorizaUrl}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '' },
      body: JSON.stringify({
        to, templateCode: 'INOUT_SALE_RECEIPT', variables, tenantId,
        attachments: [{ filename: `Comprobante ${code}.pdf`, contentBase64: pdf.toString('base64'), contentType: 'application/pdf' }],
      }),
    }).catch(() => null);
    const body: any = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok || body?.success === false) {
      await this.limits.decrement(tenantId, 'nCorreos').catch(() => {});
      this.logger.warn(`No se pudo enviar el comprobante ${code} a ${to}: ${body?.message || res?.status || 'sin conexión'}`);
      throw new ServiceUnavailableException('No se pudo enviar el correo. Intenta de nuevo en un momento.');
    }
    return { success: true, to };
  }

  /** Variables de la plantilla, ya escapadas. */
  async variables(tenantId: string, sale: Sale): Promise<Record<string, string>> {
    let params: Record<string, any> = {};
    try { params = await this.businessParams.getParams(tenantId); } catch { /* sin parámetros */ }
    let logoUrl: string | null = null;
    let note: string | null = null;
    try { const b = await this.branding.get(tenantId); logoUrl = b.logoPdfUrl; note = b.receiptNote; } catch { /* sin logo ni nota */ }
    const name = String(params['NEGOCIO_NOMBRE'] ?? '').trim() || 'Tu tienda';
    const info = [params['NEGOCIO_NIT'] ? `NIT ${params['NEGOCIO_NIT']}` : '', params['NEGOCIO_DIRECCION'], params['NEGOCIO_TELEFONO'] ? `Tel. ${params['NEGOCIO_TELEFONO']}` : '']
      .filter(Boolean).map(esc).join(' · ');

    let items: any[] = [];
    try { items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items as any[]) || []; } catch { items = []; }
    const row = (left: string, right: string, sub = '') =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #eef0f4;">${left}${sub ? `<div style="font-size:12px;color:#6b7280;">${sub}</div>` : ''}</td><td style="padding:8px 0;border-bottom:1px solid #eef0f4;text-align:right;white-space:nowrap;vertical-align:top;">${right}</td></tr>`;
    const itemsRows = groupComboLines(items)
      .map((l) => row(`<strong>${esc(l.name)}</strong><div style="font-size:12px;color:#6b7280;">${esc(l.quantity)} × ${money(l.unitPrice)}</div>`, `<strong>${money(l.total)}</strong>`, [...(l.components || []), ...(l.options || [])].map(esc).join(' · ')))
      .join('');

    const inc = Number(params['INC_PORCENTAJE']) || 0;
    const taxLabel = inc > 0 ? `INC ${inc}%` : Number(params['IVA_PORCENTAJE']) > 0 ? `IVA ${params['IVA_PORCENTAJE']}%` : 'Impuesto';
    const small = (l: string, r: string) => `<tr><td style="padding:6px 0;color:#6b7280;">${l}</td><td style="padding:6px 0;text-align:right;color:#6b7280;">${r}</td></tr>`;
    const totalsRows = [
      small('Subtotal', money(sale.subtotal)),
      Number(sale.discount) > 0 ? small('Descuento', '-' + money(sale.discount)) : '',
      Number(sale.tax) > 0 ? small(esc(taxLabel), money(sale.tax)) : '',
    ].join('');

    const day = sale.dtmCreationDate ? new Date(sale.dtmCreationDate) : new Date();
    const date = day.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const method = (m: unknown) => METHODS[String(m || 'EFECTIVO').toUpperCase()] || String(m);
    const paymentText = String(sale.paymentType || '').toUpperCase() === 'CREDITO' ? 'Pago a crédito'
      : Array.isArray(sale.payments) && sale.payments.length ? `Pago de contado · ${sale.payments.map((p) => `${method(p.method)} ${money(p.amount)}`).join(' + ')}`
      : `Pago de contado · ${method(sale.paymentMethod)}`;

    return {
      businessName: esc(name),
      businessInfo: info,
      logoBlock: logoUrl
        ? `<img src="${esc(logoUrl)}" alt="${esc(name)}" width="140" style="display:block;margin:0 auto 10px;max-width:140px;max-height:70px;width:auto;height:auto;border:0;">`
        : '',
      customerName: esc(sale.customerName || 'cliente'),
      documentCode: esc(sale.strInvoiceCode || ''),
      date: esc(date),
      itemsRows,
      totalsRows,
      total: money(sale.total),
      paymentText: esc(paymentText),
      receiptNote: note
        ? `<p style="margin:16px 0 0;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e5e7eb;font-size:13px;color:#374151;">${esc(note).replace(/\n/g, '<br>')}</p>`
        : '',
      year: String(new Date().getFullYear()),
    };
  }
}
