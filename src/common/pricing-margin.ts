import { BadRequestException } from '@nestjs/common';

/**
 * Margen de ganancia en tres niveles (sobre el costo: precio = costo × (1 + %)):
 * el del producto o material si lo tiene; si no, el de su categoría; si no, el
 * del período (PORCENTAJE_GANANCIA). Ese margen da el PRECIO SUGERIDO.
 * El PISO es otro: el costo total más el margen mínimo del período
 * (MARGEN_MINIMO, 0 por defecto = no vender bajo costo). Un precio entre el
 * piso y el sugerido se permite con aviso; bajo el piso, no.
 * Funciones puras (pricing-margin.spec.ts). Mismo criterio en el frontend
 * (shared/utils/pricing-margin.ts).
 */

export type MarginSource = 'PRODUCTO' | 'CATEGORIA' | 'PERIODO';

export const MAX_MARGIN_PERCENT = 1000;

const has = (v: unknown) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

export function effectiveMargin(levels: { item?: unknown; category?: unknown; period?: unknown }): { percent: number; source: MarginSource } {
  if (has(levels.item)) return { percent: Number(levels.item), source: 'PRODUCTO' };
  if (has(levels.category)) return { percent: Number(levels.category), source: 'CATEGORIA' };
  return { percent: has(levels.period) ? Number(levels.period) : 0, source: 'PERIODO' };
}

export const priceWithMargin = (cost: number, percent: number) => Math.round((Number(cost) || 0) * (1 + (Number(percent) || 0) / 100) * 100) / 100;

/** Precio mínimo permitido: costo total + margen mínimo del período. */
export const minimumPrice = (cost: number, minMarginPercent: unknown) => priceWithMargin(cost, Math.max(0, Number(minMarginPercent) || 0));

/** Margen real de un precio sobre su costo (null si no hay costo). */
export function actualMargin(price: number, cost: number): number | null {
  const c = Number(cost) || 0;
  if (c <= 0) return null;
  return Math.round((((Number(price) || 0) - c) / c) * 1000) / 10;
}

/** Lo que llega del formulario: null (heredar) o un % entre 0 y 1000. */
export function normalizeMarginPercent(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_MARGIN_PERCENT) {
    throw new BadRequestException(`El margen debe estar entre 0 % y ${MAX_MARGIN_PERCENT} % (o vacío para usar el de la categoría o el período).`);
  }
  return Math.round(n * 100) / 100;
}
