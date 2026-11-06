import { BadRequestException } from '@nestjs/common';
import { PAYMENT_METHODS } from '../credit/entities/receivable-payment.entity';

/** Una parte de un pago de contado dividido (ej. efectivo + transferencia). */
export interface SalePaymentPart {
  method: (typeof PAYMENT_METHODS)[number];
  amount: number;
}

/** Medio que se guarda en `paymentMethod` cuando el pago se dividió. */
export const MIXED_METHOD = 'MIXTO';
export const MAX_SPLIT_PARTS = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Valida y normaliza un pago de contado dividido en varios medios. Suma las
 * partes del mismo medio. El total final lo calcula el backend (puede haber
 * descuento automático): la diferencia con lo que mandó la caja la absorbe
 * el efectivo (o la última parte), si no la deja en cero o negativa.
 * Devuelve null si no es un pago dividido (menos de dos medios).
 */
export function normalizeSplitPayments(raw: unknown, total: number): SalePaymentPart[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  if (raw.length > MAX_SPLIT_PARTS) throw new BadRequestException(`El pago se puede dividir en máximo ${MAX_SPLIT_PARTS} medios.`);
  const byMethod = new Map<string, number>();
  for (const p of raw) {
    const method = String(p?.method || '').toUpperCase();
    const amount = round2(Number(p?.amount));
    if (!(PAYMENT_METHODS as readonly string[]).includes(method)) throw new BadRequestException('Medio de pago no válido.');
    if (!(amount > 0)) throw new BadRequestException('Cada parte del pago debe tener un valor mayor a cero.');
    byMethod.set(method, round2((byMethod.get(method) || 0) + amount));
  }
  const parts: SalePaymentPart[] = [...byMethod].map(([method, amount]) => ({ method: method as SalePaymentPart['method'], amount }));
  if (parts.length < 2) return null;
  const diff = round2(round2(total) - parts.reduce((s, p) => s + p.amount, 0));
  if (diff !== 0) {
    const target = parts.find((p) => p.method === 'EFECTIVO') || parts[parts.length - 1];
    const adjusted = round2(target.amount + diff);
    if (!(adjusted > 0)) {
      throw new BadRequestException(`Las partes del pago suman ${parts.reduce((s, p) => s + p.amount, 0)} y el total de la venta es ${round2(total)}.`);
    }
    target.amount = adjusted;
  }
  return parts;
}

/** Partes del pago de una venta (dividido o de un solo medio), para reportes. */
export function paymentParts(sale: { paymentType?: string | null; paymentMethod?: string | null; payments?: SalePaymentPart[] | null }, total: number): { method: string; amount: number }[] {
  if (String(sale.paymentType || 'CONTADO').toUpperCase() === 'CREDITO') return [{ method: 'CREDITO', amount: total }];
  if (Array.isArray(sale.payments) && sale.payments.length) return sale.payments.map((p) => ({ method: p.method, amount: Number(p.amount) || 0 }));
  return [{ method: String(sale.paymentMethod || '').toUpperCase(), amount: total }];
}
