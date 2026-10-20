import { OrderStatus } from './entities/order.entity';
import { maxPeople, nextWorkStart, ProductionShift, resolveShifts, scheduleBatches } from './shifts';

/**
 * Tiempos por etapa del kanban y cola de producción. Funciones puras (sin BD).
 *
 * - Cada etapa puede tener una duración esperada (opcional, en minutos) que
 *   configura el negocio. Sin duración, la etapa no se controla.
 * - La COLA son los pedidos confirmados esperando producción más los que ya
 *   están en producción. Con `productionCapacity` pedidos en paralelo, un
 *   pedido empieza cuando se libera un cupo: su hora estimada de listo incluye
 *   la espera por los pedidos que tiene delante, no solo su propio tiempo.
 * - Un pedido sin nada por fabricar (needsProduction = false) no entra a la
 *   cola ni ocupa cupo: está listo cuando termina de alistarse (la duración de
 *   su etapa actual).
 * - Con TURNOS (shifts.ts) la capacidad son las personas de cada turno: las
 *   tandas de los pedidos se reparten entre ellas y fuera de turno no se
 *   prepara. Sin turnos se usa productionCapacity como siempre.
 */

/** Etapas del kanban que admiten duración. */
export const TIMED_STAGES = [
  OrderStatus.DRAFT,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
] as const;

export type StageDurations = Partial<Record<(typeof TIMED_STAGES)[number], number | null>>;

export interface OrderTimingSettings {
  /** Minutos esperados por etapa (null / ausente = sin control). */
  stageDurations: StageDurations;
  /** Pedidos que se preparan a la vez (sin turnos). */
  productionCapacity: number;
  /** Turnos con sus personas (vacío = sin turnos). */
  shifts: ProductionShift[];
}

export const DEFAULT_TIMING_SETTINGS: OrderTimingSettings = { stageDurations: {}, productionCapacity: 1, shifts: [] };

const MAX_MINUTES = 60 * 24 * 90; // 90 días

export function resolveTimingSettings(saved?: Partial<OrderTimingSettings> | null): OrderTimingSettings {
  const durations: StageDurations = {};
  for (const stage of TIMED_STAGES) {
    const v = (saved?.stageDurations as any)?.[stage];
    const n = Number(v);
    if (v !== null && v !== undefined && v !== '' && Number.isFinite(n) && n > 0) {
      durations[stage] = Math.min(MAX_MINUTES, Math.round(n));
    }
  }
  const cap = Math.round(Number(saved?.productionCapacity));
  return {
    stageDurations: durations,
    productionCapacity: Number.isFinite(cap) && cap >= 1 ? Math.min(cap, 100) : 1,
    shifts: resolveShifts((saved as any)?.shifts),
  };
}

/** Tandas (minutos) de un pedido: las guardadas o, si no hay, una con todo su tiempo. */
export function batchesOf(leadHours = 0, batchMinutes?: number[] | null): number[] {
  const list = (batchMinutes || []).map(Number).filter((m) => m > 0);
  if (list.length) return list;
  const total = Math.round((Number(leadHours) || 0) * 60);
  return total > 0 ? [total] : [];
}

/**
 * Minutos esperados de producción de un pedido: la etapa o, si es mayor, su
 * fabricación. Con turnos, las tandas se reparten entre las personas (sin
 * contar las pausas entre turnos; eso lo hace la cola).
 */
export function productionMinutes(settings: OrderTimingSettings, leadHours = 0, batchMinutes?: number[] | null): number {
  const stage = settings.stageDurations[OrderStatus.IN_PRODUCTION] || 0;
  const batches = batchesOf(leadHours, batchMinutes);
  let work = batches.reduce((a, b) => a + b, 0);
  const people = settings.shifts?.length ? maxPeople(settings.shifts) : 1;
  if (people > 1 && batches.length > 1) {
    const lanes = new Array(people).fill(0);
    for (const b of [...batches].sort((x, y) => y - x)) {
      lanes.sort((x, y) => x - y);
      lanes[0] += b;
    }
    work = Math.max(...lanes);
  }
  return Math.max(stage, Math.round(work));
}

/** Hora en que debería salir de la etapa (null si la etapa no tiene duración). */
export function stageDueAt(settings: OrderTimingSettings, status: OrderStatus, enteredAt: Date, leadHours = 0, batchMinutes?: number[] | null): Date | null {
  const minutes = status === OrderStatus.IN_PRODUCTION
    ? productionMinutes(settings, leadHours, batchMinutes)
    : settings.stageDurations[status as keyof StageDurations] || 0;
  return minutes > 0 ? new Date(enteredAt.getTime() + minutes * 60000) : null;
}

export interface QueueOrder {
  id: string;
  status: OrderStatus;
  /** Cuándo entró a su etapa actual (null en pedidos anteriores: se usa createdAt). */
  stageEnteredAt: Date | null;
  createdAt: Date;
  /** Tiempo de fabricación (h): suma de las tandas por fabricar. */
  leadHours: number;
  /** Tandas por fabricar, en minutos (para repartirlas entre personas). */
  batchMinutes?: number[] | null;
  /** Pedido programado: inicio de su franja de entrega. */
  scheduledStart?: Date | null;
  /** false = nada por fabricar (solo se alista); ausente = pasa por producción. */
  needsProduction?: boolean;
}

export interface QueueEstimate {
  id: string;
  /** Posición en la cola de espera (1 = el siguiente); null si ya está en producción. */
  queuePosition: number | null;
  estimatedStartAt: Date;
  estimatedReadyAt: Date;
  /** Minutos de espera antes de empezar (0 si ya empezó). */
  waitMinutes: number;
}

/**
 * Simula la cola de producción con `productionCapacity` cupos. Los que están
 * EN_PRODUCCION ocupan un cupo hasta su hora estimada de fin; los CONFIRMADOS
 * toman el primer cupo libre en orden de llegada.
 */
export function estimateQueue(orders: QueueOrder[], settings: OrderTimingSettings, now = new Date()): QueueEstimate[] {
  if (settings.shifts?.length) return estimateQueueWithShifts(orders, settings, now);
  const t0 = now.getTime();
  const lanes: number[] = [];
  const result: QueueEstimate[] = [];
  const entered = (o: QueueOrder) => (o.stageEnteredAt || o.createdAt).getTime();

  const producing = (o: QueueOrder) => o.needsProduction !== false;

  // Sin nada por fabricar: listo al terminar de alistarse, sin esperar cupo
  for (const o of orders) {
    if (producing(o) || (o.status !== OrderStatus.CONFIRMED && o.status !== OrderStatus.IN_PRODUCTION)) continue;
    const start = entered(o);
    const stage = settings.stageDurations[o.status as keyof StageDurations] || 0;
    const end = Math.max(t0, start + stage * 60000);
    result.push({ id: o.id, queuePosition: null, estimatedStartAt: new Date(start), estimatedReadyAt: new Date(end), waitMinutes: 0 });
  }

  const inProduction = orders.filter((o) => o.status === OrderStatus.IN_PRODUCTION && producing(o)).sort((a, b) => entered(a) - entered(b));
  for (const o of inProduction) {
    const start = entered(o);
    // Si ya se pasó de su tiempo, se asume que termina ahora (está atrasado)
    const end = Math.max(t0, start + productionMinutes(settings, o.leadHours) * 60000);
    lanes.push(end);
    result.push({ id: o.id, queuePosition: null, estimatedStartAt: new Date(start), estimatedReadyAt: new Date(end), waitMinutes: 0 });
  }

  const capacity = Math.max(1, settings.productionCapacity);
  while (lanes.length < capacity) lanes.push(t0);
  lanes.sort((a, b) => a - b);
  // Más en producción que cupos (p. ej. se bajó la capacidad): el primer cupo
  // real se libera cuando terminan los que sobran, no cuando termina el primero.
  while (lanes.length > capacity) lanes.shift();

  // Un pedido programado no se prepara antes de tiempo: entra a producción
  // justo para estar listo al inicio de su franja. Se atiende por esa hora, no
  // por la de llegada, para no retrasar a los pedidos "lo antes posible".
  const notBefore = (o: QueueOrder) =>
    o.scheduledStart ? o.scheduledStart.getTime() - productionMinutes(settings, o.leadHours) * 60000 : null;
  const priority = (o: QueueOrder) => Math.max(entered(o), notBefore(o) ?? 0);
  const waiting = orders.filter((o) => o.status === OrderStatus.CONFIRMED && producing(o)).sort((a, b) => priority(a) - priority(b));
  waiting.forEach((o, i) => {
    lanes.sort((a, b) => a - b);
    const start = Math.max(t0, lanes[0], notBefore(o) ?? 0);
    const end = start + productionMinutes(settings, o.leadHours) * 60000;
    lanes[0] = end;
    result.push({
      id: o.id,
      queuePosition: i + 1,
      estimatedStartAt: new Date(start),
      estimatedReadyAt: new Date(end),
      waitMinutes: Math.round((start - t0) / 60000),
    });
  });

  return result;
}

/**
 * Cola con TURNOS: cada persona del turno es un carril. Primero se ubican
 * las tandas de lo que ya está en producción (desde que entró) y luego las
 * de los confirmados por orden de atención; cada tanda la toma la persona que
 * la termine primero, solo dentro de su turno.
 */
function estimateQueueWithShifts(orders: QueueOrder[], settings: OrderTimingSettings, now: Date): QueueEstimate[] {
  const t0 = now.getTime();
  const shifts = settings.shifts;
  const stageMin = settings.stageDurations[OrderStatus.IN_PRODUCTION] || 0;
  const entered = (o: QueueOrder) => (o.stageEnteredAt || o.createdAt).getTime();
  const producing = (o: QueueOrder) => o.needsProduction !== false;
  const result: QueueEstimate[] = [];

  for (const o of orders) {
    if (producing(o) || (o.status !== OrderStatus.CONFIRMED && o.status !== OrderStatus.IN_PRODUCTION)) continue;
    const start = entered(o);
    const stage = settings.stageDurations[o.status as keyof StageDurations] || 0;
    result.push({ id: o.id, queuePosition: null, estimatedStartAt: new Date(start), estimatedReadyAt: new Date(Math.max(t0, start + stage * 60000)), waitMinutes: 0 });
  }

  const free = new Array(Math.max(1, maxPeople(shifts))).fill(-Infinity);
  /** Ubica las tandas del pedido desde `earliest`; sin tandas ocupa a una persona por la etapa. */
  const place = (o: QueueOrder, earliest: number) => {
    const batches = batchesOf(o.leadHours, o.batchMinutes);
    const work = batches.length ? batches : stageMin > 0 ? [stageMin] : [];
    if (!work.length) {
      const st = nextWorkStart(shifts, 0, earliest) ?? earliest;
      return { start: st, end: st };
    }
    const { start, end } = scheduleBatches(shifts, free, work, earliest);
    return { start, end: Math.max(end, start + stageMin * 60000) };
  };

  const inProduction = orders.filter((o) => o.status === OrderStatus.IN_PRODUCTION && producing(o)).sort((a, b) => entered(a) - entered(b));
  for (const o of inProduction) {
    const { end } = place(o, entered(o));
    result.push({ id: o.id, queuePosition: null, estimatedStartAt: new Date(entered(o)), estimatedReadyAt: new Date(Math.max(t0, end)), waitMinutes: 0 });
  }
  // Lo atrasado se asume terminando ahora: nadie queda ocupado en el pasado
  for (let i = 0; i < free.length; i++) free[i] = Math.max(free[i], t0);

  const notBefore = (o: QueueOrder) =>
    o.scheduledStart ? o.scheduledStart.getTime() - productionMinutes(settings, o.leadHours, o.batchMinutes) * 60000 : null;
  const priority = (o: QueueOrder) => Math.max(entered(o), notBefore(o) ?? 0);
  const waiting = orders.filter((o) => o.status === OrderStatus.CONFIRMED && producing(o)).sort((a, b) => priority(a) - priority(b));
  waiting.forEach((o, i) => {
    const { start, end } = place(o, Math.max(t0, notBefore(o) ?? 0));
    result.push({
      id: o.id,
      queuePosition: i + 1,
      estimatedStartAt: new Date(start),
      estimatedReadyAt: new Date(end),
      waitMinutes: Math.max(0, Math.round((start - t0) / 60000)),
    });
  });
  return result;
}
