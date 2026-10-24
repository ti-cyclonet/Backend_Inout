/** Utilidades de fechas (Bogotá, UTC-5 fijo) para los resúmenes del Dashboard. */
/** Colombia no tiene horario de verano: UTC-5 fijo. */
export const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

export function bogotaMonthStart(now: Date, delta = 0): Date {
  const l = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + delta, 1) + BOGOTA_OFFSET_MS);
}
export function bogotaDayStart(now: Date, delta = 0): Date {
  const l = new Date(now.getTime() - BOGOTA_OFFSET_MS);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() + delta) + BOGOTA_OFFSET_MS);
}
export const dayKey = (d: Date | string) => new Date(new Date(d).getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
export const num = (v: any) => Number(v) || 0;


/** Día (YYYY-MM-DD) de una columna `date`: TypeORM la entrega como texto o como Date. */
function asDay(v: unknown): string | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  return null;
}

/**
 * Cuándo ocurrió una venta para los paneles: su fecha de venta (`dtmDate`, la
 * que se registra en la venta), con la hora real de registro si es el mismo
 * día. Antes los paneles usaban solo `dtmCreationDate`: una venta registrada
 * con otra fecha caía en el día en que se digitó. Una venta de otro día se
 * ubica a mediodía (Bogotá) de su fecha.
 */
export function saleAt(sale: { dtmDate?: unknown; dtmCreationDate?: unknown }): Date | null {
  const created = sale.dtmCreationDate ? new Date(sale.dtmCreationDate as any) : null;
  const day = asDay(sale.dtmDate);
  if (!day) return created;
  if (created && !isNaN(created.getTime()) && dayKey(created) === day) return created;
  return new Date(Date.parse(`${day}T12:00:00Z`) + BOGOTA_OFFSET_MS);
}

/** Filtro SQL de ventas desde `from` por fecha de venta o de registro (alias `s`). */
export const SALES_SINCE_SQL = '(s.dtmDate >= :fromDay OR s.dtmCreationDate >= :from)';
export const salesSinceParams = (from: Date) => ({ from, fromDay: dayKey(from) });

export interface ExpiringLotRow { materialId: string; name: string; expiresAt: Date | string; quantity: unknown }

/**
 * Lote más próximo a vencer de cada material (para resaltarlo en la lista de
 * materiales), con los días que le quedan y cuántos lotes vencen en la ventana.
 */
export function nearestExpiryByMaterial(rows: ExpiringLotRow[], now: Date) {
  const out = new Map<string, { materialId: string; name: string; expiresAt: string; daysLeft: number; quantity: number; lots: number }>();
  for (const r of rows) {
    if (!r.materialId || !r.expiresAt) continue;
    const at = new Date(r.expiresAt);
    const daysLeft = Math.max(0, Math.ceil((at.getTime() - now.getTime()) / DAY_MS));
    const cur = out.get(r.materialId);
    if (!cur) out.set(r.materialId, { materialId: r.materialId, name: r.name, expiresAt: at.toISOString(), daysLeft, quantity: num(r.quantity), lots: 1 });
    else {
      cur.lots++;
      if (at.getTime() < new Date(cur.expiresAt).getTime()) Object.assign(cur, { expiresAt: at.toISOString(), daysLeft, quantity: num(r.quantity) });
    }
  }
  return [...out.values()].sort((a, b) => a.daysLeft - b.daysLeft);
}
