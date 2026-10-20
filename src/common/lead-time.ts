/**
 * Tiempo de fabricación. Se registra en MINUTOS (intProductionLeadMinutes /
 * productionLeadMinutes); las columnas en horas enteras quedan como respaldo
 * de los datos anteriores y para clientes que aún las leen.
 */
const minutesOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Horas (con decimales) que toma fabricar el producto. */
export function productLeadHours(entity: { intProductionLeadMinutes?: unknown; intProductionLeadHours?: unknown } | null | undefined): number {
  const minutes = minutesOf(entity?.intProductionLeadMinutes);
  if (minutes !== null) return minutes / 60;
  return Math.max(0, Number(entity?.intProductionLeadHours) || 0);
}

/**
 * Tiempo por TANDAS: una tanda toma `leadHours` y rinde `unitsPerBatch`
 * (en la misma unidad que `toMake`). Ej.: una piña (10 min) rinde 8 rodajas;
 * 20 rodajas = 3 tandas = 30 min. Sin rendimiento (Infinity) es una sola tanda.
 */
export function batchLeadHours(leadHours: number, toMake: number, unitsPerBatch: number): number {
  const h = Math.max(0, Number(leadHours) || 0);
  const qty = Math.max(0, Number(toMake) || 0);
  if (!h || !qty) return 0;
  if (!Number.isFinite(unitsPerBatch) || !(unitsPerBatch > 0)) return h;
  return Math.ceil(qty / unitsPerBatch - 1e-9) * h;
}

/** Horas (con decimales) de fabricación registradas en el pedido. */
export function orderLeadHours(order: { productionLeadMinutes?: unknown; productionLeadHours?: unknown } | null | undefined): number {
  const minutes = minutesOf(order?.productionLeadMinutes);
  if (minutes !== null) return minutes / 60;
  return Math.max(0, Number(order?.productionLeadHours) || 0);
}

/** Columnas del pedido para un tiempo de fabricación en horas. */
export function orderLeadColumns(hours: number): { productionLeadHours: number | null; productionLeadMinutes: number | null } {
  const h = Math.max(0, Number(hours) || 0);
  return h > 0
    ? { productionLeadHours: Math.ceil(h), productionLeadMinutes: Math.round(h * 60) }
    : { productionLeadHours: null, productionLeadMinutes: null };
}

/** Horas enteras equivalentes (respaldo) para unos minutos de fabricación. */
export function legacyLeadHours(minutes: unknown): number | null {
  const m = minutesOf(minutes);
  return m === null ? null : Math.ceil(m / 60);
}
