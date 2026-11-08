import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ReferenceSource, ReferenceUse, duplicateMessage, normalizeReference, useLabel } from './payment-reference';

/** Solo letras y números en mayúscula (el SQL trae candidatos; la comparación exacta es normalizeReference). */
const ALNUM = (col: string) => `regexp_replace(upper(${col}), '[^A-Z0-9]', '', 'g')`;

interface Row { id: string; code: string | null; date: Date | null; ref: string }

/**
 * Busca una referencia de pago en todo lo que registra el negocio: ventas
 * (volante), pagos de pedidos, abonos y comprobantes de cartera, y anticipos
 * de reservas. No cuentan los soportes rechazados ni las ventas anuladas.
 */
@Injectable()
export class PaymentReferencesService {
  private readonly logger = new Logger(PaymentReferencesService.name);

  constructor(private readonly dataSource: DataSource) {}

  async findUses(
    tenantId: string,
    raw: unknown,
    exclude: { source: ReferenceSource; id: string }[] = [],
    manager?: EntityManager,
  ): Promise<ReferenceUse[]> {
    const ref = normalizeReference(raw);
    if (!ref) return [];
    const em = manager || this.dataSource.manager;
    // Candidatos: la referencia guardada TERMINA igual (los prefijos "Ref.", "No."… van al inicio)
    const q = (source: ReferenceSource, sql: string, col: string) =>
      em.query(`${sql} AND ${ALNUM(col)} LIKE '%' || $2`, [tenantId, ref]).then(
        (rows: Row[]) => rows.filter((r) => normalizeReference(r.ref) === ref).map((r) => ({ source, ...r })),
        (err: Error) => {
          // Que una consulta falle no puede dejar pasar un duplicado sin aviso
          this.logger.error(`Referencias de pago (${source}): ${err.message}`);
          throw err;
        },
      );
    const groups = await Promise.all([
      q('VENTA', `SELECT "strId" AS id, "strInvoiceCode" AS code, "dtmCreationDate" AS date, "strPaymentReference" AS ref
          FROM manufacturing.sales WHERE "strTenantId" = $1 AND "dtmVoidedAt" IS NULL AND "strPaymentReference" IS NOT NULL`, '"strPaymentReference"'),
      q('PEDIDO', `SELECT p.id, o."orderCode" AS code, p."createdAt" AS date, p.reference AS ref
          FROM manufacturing.order_payments p LEFT JOIN manufacturing.orders o ON o.id = p."orderId"
          WHERE p."tenantId" = $1 AND p.status <> 'RECHAZADO' AND p.reference IS NOT NULL`, 'p.reference'),
      // Los abonos que nacen de un comprobante del cliente ya cuentan por el comprobante
      q('CARTERA', `SELECT p.id, r."documentCode" AS code, p."createdAt" AS date, p.reference AS ref
          FROM manufacturing.receivable_payments p LEFT JOIN manufacturing.receivables r ON r.id = p."receivableId"
          WHERE p."tenantId" = $1 AND p.reference IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM manufacturing.receivable_vouchers v WHERE v."paymentId" = p.id)`, 'p.reference'),
      q('COMPROBANTE_CARTERA', `SELECT v.id, r."documentCode" AS code, v."createdAt" AS date, v.reference AS ref
          FROM manufacturing.receivable_vouchers v LEFT JOIN manufacturing.receivables r ON r.id = v."receivableId"
          WHERE v."tenantId" = $1 AND v.status <> 'RECHAZADO' AND v.reference IS NOT NULL`, 'v.reference'),
      q('RESERVA', `SELECT id, code, "createdAt" AS date, "depositReference" AS ref
          FROM manufacturing.table_reservations
          WHERE "tenantId" = $1 AND COALESCE("depositStatus", '') <> 'RECHAZADO' AND "depositReference" IS NOT NULL`, '"depositReference"'),
    ]);
    return groups
      .flat()
      .filter((u) => !exclude.some((e) => e.source === u.source && String(e.id) === String(u.id)))
      .map((u) => ({ source: u.source, id: u.id, label: useLabel(u.source, u.code), date: u.date }));
  }

  /** 409 REFERENCE_USED si la referencia ya está en otra transacción del negocio. */
  async assertUnused(
    tenantId: string,
    raw: unknown,
    exclude: { source: ReferenceSource; id: string }[] = [],
    manager?: EntityManager,
  ): Promise<void> {
    const uses = await this.findUses(tenantId, raw, exclude, manager);
    if (!uses.length) return;
    const ref = String(raw ?? '').trim();
    throw new ConflictException({
      error: 'REFERENCE_USED',
      reference: ref,
      usedIn: uses[0].label,
      message: duplicateMessage(ref, uses[0]),
    });
  }
}
