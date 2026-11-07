import { BadRequestException } from '@nestjs/common';
import { DayHours, bogotaDate, bogotaToUtc } from '../orders/scheduling';

/**
 * Mesas y reservas: reglas puras (dining-rules.spec.ts). Todo el horario en
 * hora de Colombia, guardado en UTC, como los pedidos programados.
 */

// ─── Configuración del negocio ───

export type DepositMode = 'none' | 'required';
export type PreorderMode = 'none' | 'optional' | 'required';

export interface DiningSettings {
  /** Cuánto dura una reserva (minutos). */
  durationMinutes: number;
  /** Cuánto se espera al cliente antes de liberar la mesa (minutos). */
  toleranceMinutes: number;
  /** Cada cuánto se ofrecen horas para reservar. */
  slotMinutes: number;
  /** Anticipación mínima para reservar (horas). */
  minLeadHours: number;
  /** Hasta cuántos días adelante se puede reservar. */
  maxDaysAhead: number;
  /** Las reservas de la tienda quedan confirmadas solas o las confirma el negocio. */
  confirmMode: 'auto' | 'manual';
  /** Anticipo para reservar desde la tienda. */
  depositMode: DepositMode;
  /** Valor del anticipo en pesos (por reserva, o por persona). */
  depositAmount: number;
  depositPerPerson: boolean;
  /** Pedido anticipado: sin pedido, opcional u obligatorio al reservar en la tienda. */
  preorderMode: PreorderMode;
  /** Reservas desde la tienda online (fase 3). */
  onlineEnabled: boolean;
}

export const DEFAULT_DINING_SETTINGS: DiningSettings = {
  durationMinutes: 90,
  toleranceMinutes: 15,
  slotMinutes: 30,
  minLeadHours: 1,
  maxDaysAhead: 30,
  confirmMode: 'manual',
  depositMode: 'none',
  depositAmount: 0,
  depositPerPerson: false,
  preorderMode: 'optional',
  onlineEnabled: false,
};

/** Se puede sentar a alguien hasta 30 min antes del cierre. */
export const LAST_SEATING_MINUTES = 30;
export const SLOT_OPTIONS = [15, 30, 60];

const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

export function resolveDiningSettings(saved?: Partial<DiningSettings> | null): DiningSettings {
  const s: any = saved || {};
  const d = DEFAULT_DINING_SETTINGS;
  return {
    durationMinutes: int(s.durationMinutes, d.durationMinutes, 15, 360),
    toleranceMinutes: int(s.toleranceMinutes, d.toleranceMinutes, 0, 120),
    slotMinutes: SLOT_OPTIONS.includes(Number(s.slotMinutes)) ? Number(s.slotMinutes) : d.slotMinutes,
    minLeadHours: int(s.minLeadHours, d.minLeadHours, 0, 72),
    maxDaysAhead: int(s.maxDaysAhead, d.maxDaysAhead, 1, 120),
    confirmMode: s.confirmMode === 'auto' ? 'auto' : 'manual',
    depositMode: s.depositMode === 'required' ? 'required' : 'none',
    depositAmount: int(s.depositAmount, 0, 0, 10_000_000),
    depositPerPerson: s.depositPerPerson === true,
    preorderMode: ['none', 'optional', 'required'].includes(s.preorderMode) ? s.preorderMode : d.preorderMode,
    onlineEnabled: s.onlineEnabled === true,
  };
}

export function validateDiningSettings(raw: any): DiningSettings {
  const s = resolveDiningSettings(raw);
  if (s.depositMode === 'required' && s.depositAmount <= 0) {
    throw new BadRequestException('Indica el valor del anticipo para reservar.');
  }
  return s;
}

/** Anticipo de una reserva según la configuración. */
export function depositFor(settings: DiningSettings, partySize: number): number {
  if (settings.depositMode !== 'required') return 0;
  return settings.depositPerPerson ? settings.depositAmount * Math.max(1, partySize) : settings.depositAmount;
}

// ─── Mesas ───

export type TableShape = 'square' | 'round' | 'rect';
export const TABLE_SHAPES: TableShape[] = ['square', 'round', 'rect'];

export interface TableInput {
  name: string;
  zone: string;
  seats: number;
  shape: TableShape;
  posX: number;
  posY: number;
  joinable: boolean;
}

const pct = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : def;
};

export function validateTable(raw: any, partial = false): Partial<TableInput> {
  const out: Partial<TableInput> = {};
  if (!partial || raw?.name !== undefined) {
    const name = String(raw?.name ?? '').trim();
    if (!name || name.length > 30) throw new BadRequestException('El nombre de la mesa es obligatorio (hasta 30 caracteres).');
    out.name = name;
  }
  if (!partial || raw?.zone !== undefined) {
    const zone = String(raw?.zone ?? '').trim() || 'Salón';
    if (zone.length > 40) throw new BadRequestException('El nombre de la zona puede tener hasta 40 caracteres.');
    out.zone = zone;
  }
  if (!partial || raw?.seats !== undefined) {
    const seats = Number(raw?.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 30) throw new BadRequestException('Los puestos de la mesa van de 1 a 30.');
    out.seats = seats;
  }
  if (!partial || raw?.shape !== undefined) out.shape = TABLE_SHAPES.includes(raw?.shape) ? raw.shape : 'square';
  if (!partial || raw?.posX !== undefined) out.posX = pct(raw?.posX, 10);
  if (!partial || raw?.posY !== undefined) out.posY = pct(raw?.posY, 10);
  if (!partial || raw?.joinable !== undefined) out.joinable = raw?.joinable === true;
  return out;
}

// ─── Reservas ───

export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'SEATED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
export type ReservationSource = 'STAFF' | 'WALK_IN' | 'MARKETPLACE';

/** Estados que ocupan la mesa. */
export const BLOCKING: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'SEATED'];

export const STATUS_LABELS: Record<ReservationStatus, string> = {
  PENDING: 'Por confirmar',
  CONFIRMED: 'Confirmada',
  SEATED: 'En la mesa',
  COMPLETED: 'Finalizada',
  NO_SHOW: 'No llegó',
  CANCELLED: 'Cancelada',
};

const TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  PENDING: ['CONFIRMED', 'SEATED', 'NO_SHOW', 'CANCELLED'],
  CONFIRMED: ['SEATED', 'NO_SHOW', 'CANCELLED'],
  SEATED: ['COMPLETED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export function assertTransition(from: ReservationStatus, to: ReservationStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new BadRequestException(`Una reserva ${STATUS_LABELS[from]?.toLowerCase() || from} no puede pasar a ${STATUS_LABELS[to]?.toLowerCase() || to}.`);
  }
}

export interface ReservationLike {
  id: string;
  tableIds: string[];
  startAt: Date;
  endAt: Date;
  status: ReservationStatus;
}

/** Mientras no se marque Finalizada, una mesa ocupada que se pasó de la hora sigue ocupada este rato más. */
export const OVERSTAY_GRACE_MINUTES = 15;

/** Hasta cuándo ocupa la mesa la reserva. */
export function occupiedUntil(r: ReservationLike, now: Date): Date {
  const grace = now.getTime() + OVERSTAY_GRACE_MINUTES * 60_000;
  return r.status === 'SEATED' && r.endAt.getTime() < grace ? new Date(grace) : r.endAt;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Primera reserva que choca con [start, end) en alguna de las mesas. */
export function findConflict(
  tableIds: string[],
  start: Date,
  end: Date,
  reservations: ReservationLike[],
  now: Date,
  excludeId?: string,
): ReservationLike | null {
  return reservations.find((r) =>
    r.id !== excludeId
    && BLOCKING.includes(r.status)
    && r.tableIds.some((t) => tableIds.includes(t))
    && overlaps(start, end, r.startAt, occupiedUntil(r, now)),
  ) || null;
}

export interface TableLike {
  id: string;
  name: string;
  seats: number;
  active: boolean;
}

export interface DiningSlot {
  start: Date;
  end: Date;
  available: boolean;
  reason?: 'PASADA' | 'ANTICIPACION' | 'LLENA';
  /** Mesa sugerida: la más pequeña en la que caben. */
  tableId?: string;
  tableName?: string;
}

/**
 * Horas para reservar un día ('YYYY-MM-DD'): dentro del horario de atención,
 * cada `slotMinutes`, con la última llegada 30 min antes del cierre. Una hora
 * está disponible si alguna mesa activa donde caben está libre toda la reserva.
 */
export function diningSlots(
  date: string,
  partySize: number,
  settings: DiningSettings,
  hours: DayHours[],
  tables: TableLike[],
  reservations: ReservationLike[],
  now: Date,
): DiningSlot[] {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const day = hours.find((h) => h.day === weekday);
  if (!day?.active) return [];
  const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const open = toMin(day.open);
  const lastSeat = toMin(day.close) - LAST_SEATING_MINUTES;
  const earliest = now.getTime() + settings.minLeadHours * 3600_000;
  const fitting = tables.filter((t) => t.active && t.seats >= partySize).sort((a, b) => a.seats - b.seats);
  const slots: DiningSlot[] = [];
  for (let min = open; min <= lastSeat; min += settings.slotMinutes) {
    const start = bogotaToUtc(date, min);
    const end = new Date(start.getTime() + settings.durationMinutes * 60_000);
    if (start.getTime() <= now.getTime()) { slots.push({ start, end, available: false, reason: 'PASADA' }); continue; }
    if (start.getTime() < earliest) { slots.push({ start, end, available: false, reason: 'ANTICIPACION' }); continue; }
    const free = fitting.find((t) => !findConflict([t.id], start, end, reservations, now));
    slots.push(free ? { start, end, available: true, tableId: free.id, tableName: free.name } : { start, end, available: false, reason: 'LLENA' });
  }
  return slots;
}

/** Valida la fecha de una reserva de la tienda: anticipación y días adelante. */
export function assertBookableDate(start: Date, settings: DiningSettings, now: Date): void {
  if (start.getTime() < now.getTime() + settings.minLeadHours * 3600_000) {
    throw new BadRequestException(`Las reservas se hacen con al menos ${settings.minLeadHours} h de anticipación.`);
  }
  const last = new Date(now.getTime() + settings.maxDaysAhead * 86_400_000);
  if (bogotaDate(start) > bogotaDate(last)) {
    throw new BadRequestException(`Las reservas se hacen hasta ${settings.maxDaysAhead} días adelante.`);
  }
}

/** Siguiente código de reserva: RS-00001, RS-00002… */
export function nextReservationCode(last: string | null | undefined): string {
  const n = Number(String(last || '').replace(/^RS-/, ''));
  return `RS-${String((Number.isFinite(n) ? n : 0) + 1).padStart(5, '0')}`;
}
