/**
 * DESTACADOS EN CYCLONET MARKET: el negocio paga por aparecer primero (con
 * insignia) en la vitrina general por 7 o 30 días. Funciones puras (sin BD).
 *
 * - Se cobra con una factura de Authoriza que se paga en FactoNet (sin
 *   contrato: si no se paga no afecta el plan de InOut).
 * - Hay CUPOS: a lo sumo `slots` tiendas destacadas a la vez. Una solicitud
 *   reserva su cupo mientras espera el pago; si no se paga a tiempo se libera.
 * - Precios y cupos los define la cuenta de CycloNet (platform_settings).
 *   Sin precios, la función está apagada.
 */

export type FeaturedPlan = 'WEEK' | 'MONTH';
export const FEATURED_DAYS: Record<FeaturedPlan, number> = { WEEK: 7, MONTH: 30 };
export const FEATURED_SETTINGS_KEY = 'market_featured';

/** Días que se espera el pago antes de liberar el cupo (salvo pago reportado). */
export const PAYMENT_WAIT_DAYS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface FeaturedSettings {
  /** Precio de 7 días (0 = no se ofrece). */
  priceWeek: number;
  /** Precio de 30 días (0 = no se ofrece). */
  priceMonth: number;
  /** Tiendas destacadas a la vez. */
  slots: number;
}

export const DEFAULT_FEATURED_SETTINGS: FeaturedSettings = { priceWeek: 0, priceMonth: 0, slots: 6 };

const money = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 100_000_000) : 0;
};

export function resolveFeaturedSettings(raw: any): FeaturedSettings {
  const slots = Math.round(Number(raw?.slots));
  return {
    priceWeek: money(raw?.priceWeek),
    priceMonth: money(raw?.priceMonth),
    slots: Number.isFinite(slots) && slots >= 1 ? Math.min(slots, 50) : DEFAULT_FEATURED_SETTINGS.slots,
  };
}

export const featuredEnabled = (s: FeaturedSettings) => s.priceWeek > 0 || s.priceMonth > 0;
export const priceOf = (s: FeaturedSettings, plan: FeaturedPlan) => (plan === 'WEEK' ? s.priceWeek : s.priceMonth);

/** Reserva que ocupa cupo: activa o esperando el pago. */
export interface Booking {
  startsAt: Date;
  endsAt: Date;
}

/** ¿Cuántas reservas ocupan cupo en algún momento de [from, to)? (máximo simultáneo) */
export function peakUsage(bookings: Booking[], from: number, to: number): number {
  const inRange = bookings.filter((b) => b.startsAt.getTime() < to && b.endsAt.getTime() > from);
  // El máximo de reservas a la vez ocurre en el inicio de alguna de ellas (o en `from`)
  const points = [from, ...inRange.map((b) => Math.max(from, b.startsAt.getTime()))];
  let peak = 0;
  for (const t of points) {
    peak = Math.max(peak, inRange.filter((b) => b.startsAt.getTime() <= t && b.endsAt.getTime() > t).length);
  }
  return peak;
}

/**
 * Primer inicio >= `from` en que hay cupo durante `days` días seguidos.
 * Prueba `from` y luego cada fin de reserva (es cuando se libera un cupo).
 */
export function nextFreeStart(bookings: Booking[], slots: number, days: number, from: Date): Date {
  const len = days * DAY_MS;
  const candidates = [from.getTime(), ...bookings.map((b) => b.endsAt.getTime()).filter((t) => t > from.getTime())]
    .sort((a, b) => a - b);
  for (const start of candidates) {
    if (peakUsage(bookings, start, start + len) < slots) return new Date(start);
  }
  // Inalcanzable con cupos >= 1: después de la última reserva siempre hay cupo
  return new Date(candidates[candidates.length - 1]);
}

export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Concepto de la factura, ej. "Destacado en CycloNet Market · 7 días (21/10 al 28/10)". */
export function invoiceConcept(plan: FeaturedPlan, startsAt: Date, endsAt: Date): string {
  const f = (d: Date) => d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', timeZone: 'America/Bogota' });
  return `Destacado en CycloNet Market · ${FEATURED_DAYS[plan]} días (${f(startsAt)} al ${f(endsAt)})`;
}
