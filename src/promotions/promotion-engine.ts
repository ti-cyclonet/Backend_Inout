/**
 * Motor de promociones (puro, sin base de datos).
 *
 * Reglas:
 * - En cada línea se aplica solo la MEJOR promoción vigente (mayor descuento
 *   por unidad); no se acumulan.
 * - Ninguna promoción baja una línea más del tope `maxPercent`
 *   (PORCENTAJE_DESCUENTO_MAX del período), ni por debajo de 0.
 * - Los componentes de un combo no reciben promociones de producto/categoría
 *   (el combo ya tiene su precio): al combo solo le aplican promociones
 *   dirigidas a él o a todo el catálogo.
 */
import { PromotionChannel, PromotionDiscountType, PromotionScope, PromotionTarget } from './entities/promotion.entity';

export interface PromotionRule {
  id: string;
  name: string;
  status: string;
  discountType: PromotionDiscountType;
  value: number;
  scope: PromotionScope;
  targets: PromotionTarget[];
  channel: PromotionChannel;
  startDate: string; // YYYY-MM-DD
  endDate: string | null;
  weekdays: number[] | null;
  timeFrom: string | null; // HH:MM
  timeTo: string | null;
}

export type PricingChannel = 'POS' | 'MARKETPLACE';

/** Momento en hora de Bogotá. */
export interface LocalMoment {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = domingo
  minutes: number; // minutos desde medianoche
}

export interface PricedItemRef {
  itemType: 'product' | 'material' | 'material_t' | 'kit' | 'combo';
  id: string;
  categoryId?: number | string | null;
  /** Línea que es componente de un combo (no recibe promos de producto/categoría). */
  insideCombo?: boolean;
}

export interface AppliedPromotion {
  id: string;
  name: string;
  discountType: PromotionDiscountType;
  value: number;
  /** Descuento por unidad efectivamente aplicado (ya con el tope). */
  discountPerUnit: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Fecha, día de la semana y minutos en Bogotá (UTC-5, sin horario de verano). */
export function bogotaMoment(now: Date = new Date()): LocalMoment {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, p.value]),
  );
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays.indexOf(parts.weekday),
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** ¿La promoción está vigente en este momento y canal? */
export function isPromotionLive(p: PromotionRule, at: LocalMoment, channel: PricingChannel): boolean {
  if (p.status !== 'active') return false;
  if (p.channel !== 'ALL' && p.channel !== channel) return false;
  if (at.date < p.startDate) return false;
  if (p.endDate && at.date > p.endDate) return false;
  if (p.weekdays && p.weekdays.length > 0 && !p.weekdays.includes(at.weekday)) return false;
  if (p.timeFrom && p.timeTo) {
    const from = toMinutes(p.timeFrom);
    const to = toMinutes(p.timeTo);
    const inside = from <= to
      ? at.minutes >= from && at.minutes < to
      : at.minutes >= from || at.minutes < to; // cruza la medianoche
    if (!inside) return false;
  }
  return true;
}

/** ¿La promoción aplica a este ítem? */
export function promotionMatches(p: PromotionRule, item: PricedItemRef): boolean {
  if (p.scope === 'ALL') return !item.insideCombo;
  if (item.insideCombo) return false;
  return (p.targets || []).some((t) => {
    if (t.type === 'category') {
      return item.itemType !== 'combo' && item.itemType !== 'kit'
        && item.categoryId !== null && item.categoryId !== undefined && String(item.categoryId) === String(t.id);
    }
    return t.type === item.itemType && t.id === item.id;
  });
}

/** Descuento por unidad de una promoción sobre un precio, con el tope de %. */
export function discountFor(p: Pick<PromotionRule, 'discountType' | 'value'>, unitPrice: number, maxPercent = 100): number {
  if (!(unitPrice > 0)) return 0;
  const raw = p.discountType === 'PERCENT' ? unitPrice * (Math.min(100, Math.max(0, p.value)) / 100) : Math.max(0, p.value);
  const cap = unitPrice * (Math.min(100, Math.max(0, maxPercent)) / 100);
  return round2(Math.min(raw, cap, unitPrice));
}

/** La mejor promoción vigente para el ítem (null si ninguna aplica). */
export function bestPromotion(
  promotions: PromotionRule[],
  item: PricedItemRef,
  unitPrice: number,
  at: LocalMoment,
  channel: PricingChannel,
  maxPercent = 100,
): AppliedPromotion | null {
  let best: AppliedPromotion | null = null;
  for (const p of promotions) {
    if (!isPromotionLive(p, at, channel) || !promotionMatches(p, item)) continue;
    const discountPerUnit = discountFor(p, unitPrice, maxPercent);
    if (discountPerUnit <= 0) continue;
    if (!best || discountPerUnit > best.discountPerUnit) {
      best = { id: p.id, name: p.name, discountType: p.discountType, value: p.value, discountPerUnit };
    }
  }
  return best;
}
