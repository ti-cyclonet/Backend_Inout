import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';

/**
 * Bonos de regalo (tarjeta regalo) del MarketPlace. Un cliente compra un bono
 * para otra persona con las formas de pago de la tienda; se activa cuando el
 * pago queda completo o el pedido se factura, y quien lo recibe lo usa como
 * pago en esa misma tienda, solo con su cuenta de cliente registrada.
 * Funciones puras (gift-cards.spec.ts).
 */

export const GIFT_CARD_STATUSES = ['PENDIENTE', 'ACTIVO', 'AGOTADO', 'VENCIDO', 'ANULADO'] as const;
export type GiftCardStatus = (typeof GIFT_CARD_STATUSES)[number];

/** Línea de pedido que es un bono (sin stock ni precio de catálogo). */
export const GIFT_CARD_ITEM_TYPE = 'gift_card';
export const GIFT_CARD_PRODUCT_ID = 'gift-card';

export interface GiftCardOptions {
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  /** Valores sugeridos en la tienda (dentro del rango). */
  presets: number[];
  /** Vigencia desde que se activa. */
  validityMonths: number;
}

export const DEFAULT_GIFT_CARD_OPTIONS: GiftCardOptions = {
  enabled: false,
  minAmount: 10000,
  maxAmount: 500000,
  presets: [20000, 50000, 100000],
  validityMonths: 12,
};

export const GIFT_CARD_LIMITS = { amount: 10_000_000, presets: 6, months: 60, perOrder: 10, name: 80, message: 300 };

const int = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : fallback);
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lo guardado (o enviado) → opciones completas y en rango. */
export function resolveGiftCardOptions(raw: any): GiftCardOptions {
  const s = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_GIFT_CARD_OPTIONS;
  const L = GIFT_CARD_LIMITS;
  const minAmount = Math.min(L.amount, Math.max(1000, int(s.minAmount, d.minAmount)));
  const maxAmount = Math.min(L.amount, Math.max(minAmount, int(s.maxAmount, d.maxAmount)));
  const presets = [...new Set<number>((Array.isArray(s.presets) ? s.presets : d.presets).map((p: unknown) => int(p, 0)))]
    .filter((p) => p >= minAmount && p <= maxAmount)
    .sort((a, b) => a - b)
    .slice(0, L.presets);
  return {
    enabled: s.enabled === true,
    minAmount,
    maxAmount,
    presets,
    validityMonths: Math.min(L.months, Math.max(1, int(s.validityMonths, d.validityMonths))),
  };
}

/** Valida lo que guarda la tienda (mensajes claros en vez de corregir en silencio). */
export function validateGiftCardOptions(raw: any): GiftCardOptions {
  const minAmount = Number(raw?.minAmount), maxAmount = Number(raw?.maxAmount);
  if (!Number.isFinite(minAmount) || minAmount < 1000) throw new BadRequestException('El valor mínimo del bono debe ser de al menos $1.000.');
  if (!Number.isFinite(maxAmount) || maxAmount < minAmount) throw new BadRequestException('El valor máximo debe ser mayor o igual al mínimo.');
  if (maxAmount > GIFT_CARD_LIMITS.amount) throw new BadRequestException('El valor máximo del bono es muy alto.');
  const months = Number(raw?.validityMonths);
  if (!Number.isInteger(months) || months < 1 || months > GIFT_CARD_LIMITS.months) {
    throw new BadRequestException(`La vigencia debe estar entre 1 y ${GIFT_CARD_LIMITS.months} meses.`);
  }
  return resolveGiftCardOptions(raw);
}

export interface GiftCardLineInput {
  amount: number;
  recipientName: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  senderName: string | null;
  message: string | null;
}

/** Valida un bono del carrito contra las opciones de la tienda. */
export function validateGiftCardLine(raw: any, options: GiftCardOptions): GiftCardLineInput {
  if (!options.enabled) throw new BadRequestException('Esta tienda no vende bonos de regalo.');
  const amount = Number(raw?.amount);
  if (!Number.isFinite(amount) || Math.round(amount) !== amount) throw new BadRequestException('El valor del bono no es válido.');
  if (amount < options.minAmount || amount > options.maxAmount) {
    throw new BadRequestException(`El bono debe ser de $${options.minAmount.toLocaleString('es-CO')} a $${options.maxAmount.toLocaleString('es-CO')}.`);
  }
  const recipientName = text(raw?.recipientName, GIFT_CARD_LIMITS.name);
  if (recipientName.length < 2) throw new BadRequestException('Escribe el nombre de la persona que recibe el bono.');
  const email = text(raw?.recipientEmail, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('El correo de quien recibe el bono no es válido.');
  return {
    amount,
    recipientName,
    recipientEmail: email || null,
    recipientPhone: text(raw?.recipientPhone, 30) || null,
    senderName: text(raw?.senderName, GIFT_CARD_LIMITS.name) || null,
    message: text(raw?.message, GIFT_CARD_LIMITS.message) || null,
  };
}

/** Sin caracteres que se confunden (0/O, 1/I/L). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** "BONO-7K3M-Q9XF-2HTR": 12 caracteres aleatorios (~59 bits), imposible de adivinar. */
export function generateGiftCardCode(rand: (max: number) => number = randomInt): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[rand(ALPHABET.length)]).join('');
  return `BONO-${group()}-${group()}-${group()}`;
}

/** Lo que escribe el cliente → formato del código (mayúsculas, guiones). */
export function normalizeGiftCardCode(raw: unknown): string {
  const clean = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^BONO/, '');
  if (clean.length !== 12) return '';
  return `BONO-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`;
}

/** Vence a fin del día del mismo número de día, N meses después. */
export function expiryFrom(activatedAt: Date, months: number): Date {
  const d = new Date(activatedAt.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Estado vigente (un ACTIVO cuya fecha pasó se ve VENCIDO). */
export function effectiveStatus(card: { status: GiftCardStatus; expiresAt?: Date | string | null; balance: number }, now = new Date()): GiftCardStatus {
  if (card.status === 'ACTIVO') {
    if (Number(card.balance) <= 0) return 'AGOTADO';
    if (card.expiresAt && new Date(card.expiresAt).getTime() < now.getTime()) return 'VENCIDO';
  }
  return card.status;
}

export interface Allocation {
  id: string;
  amount: number;
}

/**
 * Reparte el valor a pagar entre los bonos escogidos, en el orden dado (los
 * que vencen primero deberían ir primero). Nunca supera el saldo de cada bono
 * ni el total. Valores al peso.
 */
export function allocateGiftCards(total: number, cards: { id: string; balance: number }[]): Allocation[] {
  let remaining = Math.max(0, Math.round(Number(total) || 0));
  const out: Allocation[] = [];
  for (const c of cards) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.floor(Number(c.balance) || 0));
    if (amount <= 0) continue;
    out.push({ id: c.id, amount });
    remaining -= amount;
  }
  return out;
}

/**
 * Anticipo exigido cuando parte del pedido se paga con bonos: el plan se
 * calcula sobre lo que queda y el anticipo total incluye lo pagado con bonos
 * (así "anticipo cubierto" sigue significando lo mismo). Si los bonos cubren
 * todo, el pedido queda pagado.
 */
export function depositWithGiftCards(total: number, giftCardPaid: number, planDeposit: number): number {
  const remaining = Math.round((Number(total) - Number(giftCardPaid)) * 100) / 100;
  if (giftCardPaid > 0 && remaining < 1) return Number(total);
  return planDeposit > 0 ? Number(giftCardPaid) + Number(planDeposit) : 0;
}

/** Nombre de la línea del bono en el pedido ("BONO DE REGALO $50.000 · Para: Laura"). */
export function giftCardLineName(line: { amount: number; recipientName: string }): string {
  return `BONO DE REGALO $${line.amount.toLocaleString('es-CO')} · Para: ${line.recipientName}`;
}

export const isGiftCardLine = (l: any): boolean => l?.itemType === GIFT_CARD_ITEM_TYPE;
