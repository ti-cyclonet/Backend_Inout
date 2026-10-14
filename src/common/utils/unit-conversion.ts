/**
 * Conversión entre unidades de medida del catálogo de InOut (los mismos
 * códigos usados en material-form/product-form: kg, g, mg, lb, oz, l, ml,
 * gal, m, cm, mm, km, in, ft, m2, m3, units, pcs, box, pack, doz).
 *
 * Se usa para poder comprar un material en su "unidad de medida" (ej. kg)
 * y descargarlo en una receta/composición en una "unidad de descarga"
 * distinta (ej. g) sin descuadrar el stock: la cantidad de la receta se
 * convierte a la unidad de medida del material antes de descontar stock.
 *
 * Cada unidad pertenece a una "familia" (masa, volumen, longitud, área,
 * volumen³, conteo). Solo se puede convertir dentro de la misma familia.
 * "pack" (paquete) y "box" (caja) no traen siempre la misma cantidad: cada
 * material puede indicar cuántas unidades trae su paquete o caja
 * (`packSize`, ej. 5, 28, 100). Con ese dato ambas entran en la familia de
 * conteo con ese factor. Sin él, "pack" conserva la equivalencia histórica
 * de 6 unidades y "box" solo es compatible consigo misma.
 */

const FAMILY_UNITS: Record<string, string[]> = {
  mass: ['mg', 'g', 'kg', 'lb', 'oz'],
  volume: ['ml', 'l', 'gal'],
  length: ['mm', 'cm', 'm', 'km', 'in', 'ft'],
  area: ['m2'],
  volume3: ['m3'],
  // Paquete = 6 unidades si el material no indica cuántas trae
  count: ['units', 'pcs', 'doz', 'pack'],
  box: ['box'],
};

// Factor para convertir 1 unidad a la unidad base de su familia
// (gramo, mililitro, milímetro, m², m³, unidad).
const FACTOR_TO_BASE: Record<string, number> = {
  mg: 0.001, g: 1, kg: 1000, lb: 453.59237, oz: 28.349523125,
  ml: 1, l: 1000, gal: 3785.411784,
  mm: 1, cm: 10, m: 1000, km: 1000000, in: 25.4, ft: 304.8,
  m2: 1,
  m3: 1,
  units: 1, pcs: 1, doz: 12,
  box: 1, pack: 6,
};

/** Unidades cuyo contenido define cada material (unidades por paquete/caja). */
export const PACK_UNITS = ['pack', 'box'];

/** Unidades por paquete/caja válidas: entero de 1 a 1.000.000, o null si no se indica. */
export function normalizePackSize(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1_000_000 ? n : null;
}

/** Unidades por paquete/caja que se guardan: solo si alguna de las unidades es paquete o caja. */
export function packSizeFor(measureUnit?: string, dischargeUnit?: string, packSize?: unknown): number | null {
  return PACK_UNITS.includes(measureUnit || '') || PACK_UNITS.includes(dischargeUnit || '') ? normalizePackSize(packSize) : null;
}

function familyOf(unit: string, packSize?: number | null): string | null {
  const key = (unit || '').trim();
  if (normalizePackSize(packSize) && PACK_UNITS.includes(key)) return 'count';
  for (const [family, units] of Object.entries(FAMILY_UNITS)) {
    if (units.includes(key)) return family;
  }
  return null;
}

/**
 * ¿Se puede convertir entre estas dos unidades? true también si alguna está
 * vacía/es desconocida (no bloquea configuraciones antiguas sin unidad).
 */
export function areUnitsCompatible(unitA?: string, unitB?: string, packSize?: number | null): boolean {
  if (!unitA || !unitB || unitA === unitB) return true;
  const famA = familyOf(unitA, packSize);
  const famB = familyOf(unitB, packSize);
  if (!famA || !famB) return true; // unidad no catalogada: no bloquear
  return famA === famB;
}

/**
 * Convierte `value` de `fromUnit` a `toUnit`. Si alguna unidad falta o no
 * está catalogada, retorna `value` sin cambios (comportamiento legado). Si
 * ambas están catalogadas pero son de familias distintas, lanza error: es
 * una configuración inválida (ej. medir en "kg" y descargar en "units").
 * `packSize` = unidades que trae el paquete/caja del material (opcional).
 */
export function convertUnits(value: number, fromUnit?: string, toUnit?: string, packSize?: number | null): number {
  if (value == null || Number.isNaN(value)) return value;
  if (!fromUnit || !toUnit || fromUnit === toUnit) return value;

  const size = normalizePackSize(packSize);
  const factor = (unit: string) => (size && PACK_UNITS.includes(unit) ? size : FACTOR_TO_BASE[unit]);
  const factorFrom = factor(fromUnit);
  const factorTo = factor(toUnit);
  if (factorFrom === undefined || factorTo === undefined) return value;

  if (familyOf(fromUnit, size) !== familyOf(toUnit, size)) {
    throw new Error(
      `No se puede convertir de "${fromUnit}" a "${toUnit}": son unidades de tipos distintos (ej. masa vs. volumen).`,
    );
  }

  return (value * factorFrom) / factorTo;
}

/** Mensaje cuando la unidad de descarga no se puede convertir a la de medida. */
export function unitMismatchMessage(measureUnit: string, dischargeUnit: string): string {
  if (PACK_UNITS.includes(measureUnit) || PACK_UNITS.includes(dischargeUnit)) {
    return 'Indica cuántas unidades trae cada paquete o caja para poder descargar en unidades.';
  }
  return `La unidad de descarga ("${dischargeUnit}") debe ser del mismo tipo que la unidad de medida ("${measureUnit}") para poder convertir entre ellas.`;
}
