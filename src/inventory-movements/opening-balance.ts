/**
 * Saldo inicial de inventario: las existencias con las que el negocio empieza
 * a usar InOut, de las que no hay documento (factura, remisión). Funciones
 * puras; el registro está en opening-balance.service.ts.
 *
 * Es una entrada (IN) con motivo OPENING_BALANCE, sin proveedor ni documento,
 * con un costo unitario ESTIMADO (reposición o última compra conocida). Solo
 * se permite en un ítem sin movimientos; después, las diferencias se corrigen
 * con compras o con el conteo físico (Inventario).
 */

export type StockEntityType = 'material' | 'composite' | 'product';

export const OPENING_REASON = 'OPENING_BALANCE';

export const ENTITY_LABELS: Record<StockEntityType, string> = {
  material: 'Material',
  composite: 'Material compuesto',
  product: 'Producto',
};

/** Columnas de la plantilla de saldos iniciales (en este orden). */
export const OPENING_COLUMNS = {
  type: 'Tipo',
  code: 'Código',
  name: 'Nombre',
  unit: 'Unidad',
  quantity: 'Cantidad*',
  unitCost: 'Costo unitario*',
  date: 'Fecha de corte',
  notes: 'Observaciones',
} as const;

export interface OpeningItem {
  type: StockEntityType;
  id: string;
  quantity: number;
  /** Costo unitario estimado, en la unidad de stock del ítem. */
  unitCost: number;
  /** 'YYYY-MM-DD'; sin fecha = hoy. */
  date?: string | null;
  notes?: string | null;
}

const strip = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** "Material", "material compuesto", "PRODUCTO", "composite"… → tipo. */
export function parseEntityType(value: unknown): StockEntityType | null {
  if (value === null || value === undefined) return null;
  const v = strip(String(value));
  if (!v) return null;
  if (v === 'material' || v === 'materiales' || v === 'm') return 'material';
  if (v.startsWith('material compuesto') || v.startsWith('materiales compuestos') || v === 'composite' || v === 't') return 'composite';
  if (v.startsWith('producto') || v === 'product' || v === 'p') return 'product';
  return null;
}

/**
 * Número de una celda: número de Excel o texto en formato colombiano
 * ("1.234,5", "$ 3.200") o inglés ("1,234.5"). Vacío → null; inválido → NaN.
 */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  let s = String(value).replace(/[\s$]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // El separador que aparece de último es el decimal
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.234" o "12.500.000": separador de miles
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const isoDate = (y: number, m: number, d: number): string | null => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

/** Fecha de una celda: número de serie de Excel, 'YYYY-MM-DD' o 'DD/MM/YYYY'. Vacío → null; inválida → 'invalid'. */
export function parseDate(value: unknown): string | null | 'invalid' {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'invalid' : value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    // Serie de Excel: días desde 1899-12-30
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return Number.isNaN(dt.getTime()) ? 'invalid' : dt.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return isoDate(+m[1], +m[2], +m[3]) || 'invalid';
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (m) return isoDate(+m[3], +m[2], +m[1]) || 'invalid';
  return 'invalid';
}

/** Hoy en Colombia ('YYYY-MM-DD'). */
export function todayBogota(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}

/** Error de un saldo inicial (o null si es válido). */
export function validateOpening(item: { quantity: number | null; unitCost: number | null; date?: string | null | 'invalid' }, today = todayBogota()): string | null {
  if (item.quantity === null || Number.isNaN(item.quantity)) return 'La cantidad es obligatoria y debe ser un número.';
  if (item.quantity <= 0) return 'La cantidad debe ser mayor que cero.';
  if (item.unitCost === null || Number.isNaN(item.unitCost)) return 'El costo unitario es obligatorio (si no hay soporte, usa un costo estimado).';
  if (item.unitCost < 0) return 'El costo unitario no puede ser negativo.';
  if (item.date === 'invalid') return 'La fecha de corte no es válida (usa AAAA-MM-DD o DD/MM/AAAA).';
  if (item.date && item.date > today) return 'La fecha de corte no puede ser futura.';
  return null;
}

/** Columnas opcionales de la plantilla de materiales (carga masiva). */
export const MATERIAL_OPENING_COLUMNS = { quantity: 'Stock inicial', unitCost: 'Costo unitario' } as const;

/**
 * Saldo inicial de una fila de la carga masiva de materiales: null si no trae
 * stock inicial; si lo trae, cantidad + costo (o el error que impide usarlo).
 */
export function openingFromMaterialRow(row: Record<string, unknown>): { quantity: number; unitCost: number; error: string | null } | null {
  const quantity = parseNumber(row[MATERIAL_OPENING_COLUMNS.quantity]);
  const unitCost = parseNumber(row[MATERIAL_OPENING_COLUMNS.unitCost]);
  if (quantity === null || quantity === 0) {
    return unitCost === null || unitCost === 0 ? null : { quantity: 0, unitCost: unitCost as number, error: 'Hay Costo unitario pero falta el Stock inicial.' };
  }
  const error = validateOpening({ quantity, unitCost });
  return { quantity: quantity as number, unitCost: unitCost as number, error: error ? `Saldo inicial: ${error}` : null };
}
