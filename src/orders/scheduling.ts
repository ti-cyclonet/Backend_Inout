import { BadRequestException } from '@nestjs/common';

/**
 * Pedidos programados: el cliente elige fecha + franja horaria. Funciones puras.
 * `hours` es además el HORARIO DE ATENCIÓN de la tienda: con `onlyDuringHours`
 * los pedidos "lo antes posible" solo se reciben con la tienda abierta.
 *
 * Todo el horario está en hora de Colombia (America/Bogota, UTC-5 fijo, sin
 * horario de verano); se guarda y compara en UTC.
 */

const BOGOTA_OFFSET_MIN = -5 * 60;

export interface DayHours {
  /** 0 = domingo … 6 = sábado */
  day: number;
  active: boolean;
  /** 'HH:MM' en hora de Colombia */
  open: string;
  close: string;
}

export interface SchedulingOptions {
  enabled: boolean;
  /** Recibir pedidos "lo antes posible" solo dentro del horario de atención. */
  onlyDuringHours: boolean;
  /** Duración de cada franja en minutos (15–240). */
  slotMinutes: number;
  /** Anticipación mínima en horas desde ahora. */
  minLeadHours: number;
  /** Hasta cuántos días adelante se puede programar. */
  maxDaysAhead: number;
  /** Pedidos máximos por franja (null = sin límite). */
  maxOrdersPerSlot: number | null;
  hours: DayHours[];
}

const defaultHours = (): DayHours[] =>
  [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, active: day !== 0, open: '08:00', close: '18:00' }));

export const DEFAULT_SCHEDULING: SchedulingOptions = {
  enabled: false,
  onlyDuringHours: false,
  slotMinutes: 60,
  minLeadHours: 2,
  maxDaysAhead: 14,
  maxOrdersPerSlot: null,
  hours: defaultHours(),
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const toMinutes = (hhmm: string) => {
  const m = TIME_RE.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const num = (v: any, fallback: number) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback);

export function resolveScheduling(saved?: Partial<SchedulingOptions> | null): SchedulingOptions {
  const s: any = saved || {};
  const d = DEFAULT_SCHEDULING;
  const hours = defaultHours().map((def) => {
    const h = Array.isArray(s.hours) ? s.hours.find((x: any) => Number(x?.day) === def.day) : null;
    const open = toMinutes(h?.open) !== null ? h.open : def.open;
    const close = toMinutes(h?.close) !== null ? h.close : def.close;
    return {
      day: def.day,
      // Un día con cierre antes de la apertura queda inactivo
      active: (h?.active ?? def.active) && toMinutes(close)! > toMinutes(open)!,
      open,
      close,
    };
  });
  const maxPerSlot = s.maxOrdersPerSlot === null || s.maxOrdersPerSlot === undefined || s.maxOrdersPerSlot === ''
    ? null
    : Math.max(1, Math.round(Number(s.maxOrdersPerSlot)) || 1);
  return {
    enabled: s.enabled ?? d.enabled,
    onlyDuringHours: s.onlyDuringHours === true,
    slotMinutes: clamp(Math.round(num(s.slotMinutes, d.slotMinutes)), 15, 240),
    minLeadHours: clamp(num(s.minLeadHours, d.minLeadHours), 0, 24 * 30),
    maxDaysAhead: clamp(Math.round(num(s.maxDaysAhead, d.maxDaysAhead)), 1, 180),
    maxOrdersPerSlot: maxPerSlot,
    hours,
  };
}

/** Instante UTC de una hora local de Colombia en una fecha 'YYYY-MM-DD'. */
export function bogotaToUtc(date: string, minutesOfDay: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutesOfDay - BOGOTA_OFFSET_MIN));
}

/** Fecha 'YYYY-MM-DD' en Colombia de un instante. */
export function bogotaDate(at: Date): string {
  const local = new Date(at.getTime() + BOGOTA_OFFSET_MIN * 60000);
  return local.toISOString().slice(0, 10);
}

export interface Slot {
  start: Date;
  end: Date;
  available: boolean;
  /** Cupos restantes (null = sin límite). */
  remaining: number | null;
  /** Por qué no está disponible. */
  reason?: 'PASADA' | 'ANTICIPACION' | 'PREPARACION' | 'LLENA';
}

/**
 * Franjas de un día. `earliestReadyAt` es cuándo estaría listo el pedido según
 * la cola y la fabricación: no se ofrecen franjas que empiecen antes.
 * `takenBySlotStart` cuenta pedidos ya programados por inicio de franja (ms).
 */
export function buildSlots(
  date: string,
  options: SchedulingOptions,
  ctx: { now: Date; earliestReadyAt?: Date | null; takenBySlotStart?: Map<number, number> },
): Slot[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const hours = options.hours.find((h) => h.day === weekday);
  if (!options.enabled || !hours?.active) return [];

  const today = bogotaDate(ctx.now);
  const lastDay = bogotaDate(new Date(ctx.now.getTime() + options.maxDaysAhead * 86400000));
  if (date < today || date > lastDay) return [];

  const open = toMinutes(hours.open)!;
  const close = toMinutes(hours.close)!;
  const minStart = ctx.now.getTime() + options.minLeadHours * 3600000;
  const readyAt = ctx.earliestReadyAt?.getTime() || 0;

  const slots: Slot[] = [];
  for (let m = open; m + options.slotMinutes <= close; m += options.slotMinutes) {
    const start = bogotaToUtc(date, m);
    const end = bogotaToUtc(date, m + options.slotMinutes);
    const taken = ctx.takenBySlotStart?.get(start.getTime()) || 0;
    const remaining = options.maxOrdersPerSlot ? Math.max(0, options.maxOrdersPerSlot - taken) : null;

    let reason: Slot['reason'];
    if (start.getTime() <= ctx.now.getTime()) reason = 'PASADA';
    else if (start.getTime() < minStart) reason = 'ANTICIPACION';
    else if (start.getTime() < readyAt) reason = 'PREPARACION';
    else if (remaining === 0) reason = 'LLENA';

    slots.push({ start, end, available: !reason, remaining, ...(reason ? { reason } : {}) });
  }
  return slots;
}

/** Valida la franja elegida al crear el pedido y devuelve su inicio y fin. */
export function assertSlotAvailable(
  scheduledStart: string | Date,
  options: SchedulingOptions,
  ctx: { now: Date; earliestReadyAt?: Date | null; takenBySlotStart?: Map<number, number> },
): { start: Date; end: Date } {
  if (!options.enabled) throw new BadRequestException('Esta tienda no recibe pedidos programados.');
  const at = new Date(scheduledStart);
  if (isNaN(at.getTime())) throw new BadRequestException('Fecha y hora de entrega no válidas.');

  const slot = buildSlots(bogotaDate(at), options, ctx).find((s) => s.start.getTime() === at.getTime());
  if (!slot) throw new BadRequestException('La franja elegida no existe en el horario de la tienda.');
  if (!slot.available) {
    const messages: Record<string, string> = {
      PASADA: 'Esa franja ya pasó. Elige otra.',
      ANTICIPACION: `Los pedidos se programan con al menos ${options.minLeadHours} h de anticipación.`,
      PREPARACION: 'Tu pedido no alcanza a estar listo para esa franja. Elige una más tarde.',
      LLENA: 'Esa franja ya está llena. Elige otra.',
    };
    throw new BadRequestException(messages[slot.reason!]);
  }
  return { start: slot.start, end: slot.end };
}

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** '18:30' → '6:30 p. m.' (como lo muestra la tienda). */
export function formatHour(hhmm: string): string {
  const m = toMinutes(hhmm);
  if (m === null) return hhmm;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

/** ¿La tienda atiende en ese instante según su horario? */
export function isOpenAt(options: SchedulingOptions, at: Date): boolean {
  const date = bogotaDate(at);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const h = options.hours.find((x) => x.day === weekday);
  if (!h?.active) return false;
  const t = at.getTime();
  return t >= bogotaToUtc(date, toMinutes(h.open)!).getTime() && t < bogotaToUtc(date, toMinutes(h.close)!).getTime();
}

/** Próxima apertura después de `at` (dentro de una semana), o null si nunca abre. */
export function nextOpening(options: SchedulingOptions, at: Date): { at: Date; day: number; open: string; close: string } | null {
  const today = bogotaDate(at);
  for (let i = 0; i <= 7; i++) {
    const date = bogotaDate(new Date(bogotaToUtc(today, 12 * 60).getTime() + i * 86400000));
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const h = options.hours.find((x) => x.day === weekday);
    if (!h?.active) continue;
    const start = bogotaToUtc(date, toMinutes(h.open)!);
    if (start.getTime() > at.getTime()) return { at: start, day: weekday, open: h.open, close: h.close };
  }
  return null;
}

/** "hoy a las 6:30 p. m." / "mañana a las 8:00 a. m." / "el lunes a las 8:00 a. m.". */
export function describeOpening(next: { at: Date; open: string }, now: Date): string {
  const days = Math.round((bogotaToUtc(bogotaDate(next.at), 0).getTime() - bogotaToUtc(bogotaDate(now), 0).getTime()) / 86400000);
  const when = days === 0 ? 'hoy' : days === 1 ? 'mañana' : `el ${DAY_NAMES[new Date(`${bogotaDate(next.at)}T12:00:00Z`).getUTCDay()]}`;
  return `${when} a las ${formatHour(next.open)}`;
}

/**
 * Pedido "lo antes posible" con la tienda cerrada: si la tienda solo atiende en
 * su horario, se rechaza con cuándo abre (y se invita a programarlo si puede).
 */
export function assertOpenForAsap(options: SchedulingOptions, now: Date): void {
  if (!options.onlyDuringHours || isOpenAt(options, now)) return;
  const next = nextOpening(options, now);
  const opens = next ? ` Abrimos ${describeOpening(next, now)}`.replace(/\.?$/, '.') : '';
  const tail = options.enabled ? ' Puedes programar tu pedido para cuando estemos abiertos.' : ' Haz tu pedido dentro de nuestro horario de atención.';
  throw new BadRequestException(`La tienda está cerrada en este momento.${opens}${tail}`);
}
