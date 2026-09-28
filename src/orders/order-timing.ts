import { OrderStatus } from './entities/order.entity';

/**
 * Tiempos por etapa del kanban y cola de producción. Funciones puras (sin BD).
 *
 * - Cada etapa puede tener una duración esperada (opcional, en minutos) que
 *   configura el negocio. Sin duración, la etapa no se controla.
 * - La COLA son los pedidos confirmados esperando producción más los que ya
 *   están en producción. Con `productionCapacity` pedidos en paralelo, un
 *   pedido empieza cuando se libera un cupo: su hora estimada de listo incluye
 *   la espera por los pedidos que tiene delante, no solo su propio tiempo.
 */

/** Etapas del kanban que admiten duración. */
export const TIMED_STAGES = [
  OrderStatus.DRAFT,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PRODUCTION,
  OrderStatus.READY,
  OrderStatus.DELIVERED,
] as const;

export type StageDurations = Partial<Record<(typeof TIMED_STAGES)[number], number | null>>;

export interface OrderTimingSettings {
  /** Minutos esperados por etapa (null / ausente = sin control). */
  stageDurations: StageDurations;
  /** Pedidos que se preparan a la vez. */
  productionCapacity: number;
}

export const DEFAULT_TIMING_SETTINGS: OrderTimingSettings = { stageDurations: {}, productionCapacity: 1 };

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
  return { stageDurations: durations, productionCapacity: Number.isFinite(cap) && cap >= 1 ? Math.min(cap, 100) : 1 };
}

/** Minutos esperados de producción de un pedido: la etapa o, si es mayor, su fabricación. */
export function productionMinutes(settings: OrderTimingSettings, leadHours = 0): number {
  const stage = settings.stageDurations[OrderStatus.IN_PRODUCTION] || 0;
  return Math.max(stage, Math.round((Number(leadHours) || 0) * 60));
}

/** Hora en que debería salir de la etapa (null si la etapa no tiene duración). */
export function stageDueAt(settings: OrderTimingSettings, status: OrderStatus, enteredAt: Date, leadHours = 0): Date | null {
  const minutes = status === OrderStatus.IN_PRODUCTION
    ? productionMinutes(settings, leadHours)
    : settings.stageDurations[status as keyof StageDurations] || 0;
  return minutes > 0 ? new Date(enteredAt.getTime() + minutes * 60000) : null;
}

export interface QueueOrder {
  id: string;
  status: OrderStatus;
  /** Cuándo entró a su etapa actual (null en pedidos anteriores: se usa createdAt). */
  stageEnteredAt: Date | null;
  createdAt: Date;
  /** Mayor tiempo de fabricación (h) de sus líneas por fabricar. */
  leadHours: number;
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
  const t0 = now.getTime();
  const lanes: number[] = [];
  const result: QueueEstimate[] = [];
  const entered = (o: QueueOrder) => (o.stageEnteredAt || o.createdAt).getTime();

  const inProduction = orders.filter((o) => o.status === OrderStatus.IN_PRODUCTION).sort((a, b) => entered(a) - entered(b));
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

  const waiting = orders.filter((o) => o.status === OrderStatus.CONFIRMED).sort((a, b) => entered(a) - entered(b));
  waiting.forEach((o, i) => {
    lanes.sort((a, b) => a - b);
    const start = Math.max(t0, lanes[0]);
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
