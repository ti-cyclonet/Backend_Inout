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

