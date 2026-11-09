import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Sale } from '../sales/entities/sale.entity';
import { Customer } from '../customers/entities/customer.entity';
import { BusinessParamsService } from '../config/business-params.service';
import { buyerFromCustomer, docTypeFor, linesFromSale } from './sale-einvoice';

/** Mensaje mientras CycloNet define el proveedor tecnológico (igual al de Authoriza). */
export const EINVOICING_NOT_AVAILABLE =
  'La facturación electrónica está en configuración y todavía no está disponible. Te avisaremos cuando puedas activarla.';

const STATUS_TTL_MS = 60_000;

/**
 * Facturación electrónica de InOut. El núcleo (emisores, numeración,
 * documentos, proveedor tecnológico y el complemento del contrato) vive en
 * Authoriza (/api/einvoicing); aquí se le pide con la clave interna y se
 * emite el documento de cada venta directa cuando el negocio lo tiene ACTIVO.
 * La venta nunca espera ni falla por la facturación electrónica.
 */
@Injectable()
export class EinvoicingService {
  private readonly logger = new Logger(EinvoicingService.name);
  private readonly base = `${(process.env.AUTHORIZA_API_URL || 'http://localhost:3000').replace(/\/+$/, '')}/api/einvoicing`;
  private readonly statusCache = new Map<string, { at: number; value: any }>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly params: BusinessParamsService,
  ) {}

  private async call<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.INTERNAL_API_KEY || '', ...(init.headers || {}) },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new HttpException({ error: 'EINVOICING_UNREACHABLE', message: 'No pudimos consultar la facturación electrónica. Intenta de nuevo en un momento.' }, 502);
    }
    const body: any = await res.json().catch(() => null);
    if (!res.ok) throw new HttpException(body || { message: `HTTP ${res.status}` }, res.status);
    return body as T;
  }

  // ═══════════════════════ Negocio (Configuración › Facturación electrónica)

  async status(tenantId: string, fresh = false) {
    const hit = this.statusCache.get(tenantId);
    if (!fresh && hit && Date.now() - hit.at < STATUS_TTL_MS) return hit.value;
    const value = await this.call(`/tenants/${encodeURIComponent(tenantId)}/status`);
    this.statusCache.set(tenantId, { at: Date.now(), value });
    return value;
  }

  private async after<T>(tenantId: string, p: Promise<T>): Promise<T> {
    const r = await p;
    this.statusCache.delete(tenantId);
    return r;
  }

  requestAddon(tenantId: string, body: { tier: string; acceptTerms: boolean }, user: { email?: string }, ip?: string) {
    if (!body?.acceptTerms) throw new BadRequestException('Acepta los términos del servicio de facturación electrónica.');
    return this.after(tenantId, this.call(`/tenants/${encodeURIComponent(tenantId)}/addon`, {
      method: 'POST',
      body: JSON.stringify({ tier: body.tier, acceptTerms: true, requestedBy: user?.email || 'admin', ip: ip || null }),
    }));
  }

  cancelAddon(tenantId: string) {
    return this.after(tenantId, this.call(`/tenants/${encodeURIComponent(tenantId)}/addon/cancel`, { method: 'POST' }));
  }

  saveIssuer(tenantId: string, body: any) {
    return this.after(tenantId, this.call(`/tenants/${encodeURIComponent(tenantId)}/issuer`, { method: 'PUT', body: JSON.stringify(body || {}) }));
  }

  addResolution(tenantId: string, body: any) {
    return this.after(tenantId, this.call(`/tenants/${encodeURIComponent(tenantId)}/resolutions`, { method: 'POST', body: JSON.stringify(body || {}) }));
  }

  documentsForSale(tenantId: string, saleId: string) {
    return this.call(`/tenants/${encodeURIComponent(tenantId)}/documents?sourceApp=INOUT&sourceId=${encodeURIComponent(saleId)}`);
  }

  /** ¿Se emite el documento electrónico de las ventas de este negocio? */
  async isActive(tenantId: string): Promise<boolean> {
    try {
      const s = await this.status(tenantId);
      return !!s?.available && s?.addon?.status === 'ACTIVO';
    } catch {
      return false;
    }
  }

  // ═══════════════════════ Ventas

  /**
   * Emite la factura o el POS electrónico de una venta (después del commit,
   * sin bloquearla). Guarda en la venta el número y el estado del documento;
   * si falla, deja el motivo para reintentarlo desde el detalle de la venta.
   */
  async emitForSale(tenantId: string, saleId: string, retry = false): Promise<void> {
    if (!(await this.isActive(tenantId))) {
      if (retry) throw new BadRequestException(EINVOICING_NOT_AVAILABLE);
      return;
    }
    const repo = this.dataSource.getRepository(Sale);
    const sale = await repo.findOne({ where: { strId: saleId, strTenantId: tenantId } });
    if (!sale || sale.dtmVoidedAt) return;
    // Ya tiene documento (no ERROR): Authoriza no duplica, pero no hace falta llamarla
    if (sale.strEinvoiceId && !retry) return;
    try {
      const customer = sale.strCustomerId
        ? await this.dataSource.getRepository(Customer).findOne({ where: { id: sale.strCustomerId, tenantId } as any }).catch(() => null)
        : null;
      const buyer = buyerFromCustomer(customer);
      const type = docTypeFor(buyer, sale.paymentType);
      const tax = await this.params.getTaxInfo(tenantId);
      const doc: any = await this.call('/documents', {
        method: 'POST',
        body: JSON.stringify({
          tenantId, sourceApp: 'INOUT', sourceId: sale.strId, type,
          buyer: type === 'FACTURA' ? buyer : buyer && buyer.idNumber ? buyer : null,
          lines: linesFromSale(sale as any, tax),
          paymentMeans: sale.paymentType === 'CREDITO' ? 'CREDITO' : 'CONTADO',
          paymentMethod: sale.paymentMethod || null,
          notes: `Venta ${sale.strInvoiceCode || ''}`.trim(),
        }),
      });
      await repo.update(sale.strId, { strEinvoiceId: doc.id, strEinvoiceNumber: doc.fullNumber, strEinvoiceStatus: doc.status, strEinvoiceMessage: null });
    } catch (e: any) {
      const msg = String(e?.response?.message || e?.message || 'Error').slice(0, 300);
      this.logger.warn(`Venta ${sale.strInvoiceCode}: no se emitió el documento electrónico: ${msg}`);
      await repo.update(sale.strId, { strEinvoiceStatus: 'ERROR', strEinvoiceMessage: msg }).catch(() => {});
    }
  }

  /** Nota crédito de una venta anulada que tenía documento electrónico. */
  async creditNoteForSale(tenantId: string, saleId: string, reason: string): Promise<void> {
    const repo = this.dataSource.getRepository(Sale);
    const sale = await repo.findOne({ where: { strId: saleId, strTenantId: tenantId } });
    if (!sale?.strEinvoiceId) return;
    try {
      const note: any = await this.call('/credit-notes', {
        method: 'POST',
        body: JSON.stringify({ tenantId, sourceApp: 'INOUT', sourceId: sale.strId, reasonCode: '2', reason: `Anulación: ${reason}`.slice(0, 300) }),
      });
      if (note) await repo.update(sale.strId, { strEinvoiceCreditNote: note.fullNumber, strEinvoiceMessage: null });
    } catch (e: any) {
      const msg = String(e?.response?.message || e?.message || 'Error').slice(0, 300);
      this.logger.warn(`Venta ${sale.strInvoiceCode}: no se emitió la nota crédito: ${msg}`);
      await repo.update(sale.strId, { strEinvoiceMessage: `Nota crédito pendiente: ${msg}` }).catch(() => {});
    }
  }
}
